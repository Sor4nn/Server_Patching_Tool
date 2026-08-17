"""Interactive terminal over WebSocket, executed inside an execution environment.

Bridges a WebSocket to a `docker run` of the default execution-environment
image running `ssh` (password or key auth). A local PTY is allocated on the
backend so the remote side gets a real terminal (size, full-screen apps).
"""
import asyncio
import fcntl
import json
import os
import pty
import struct
import subprocess
import termios
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import config, database, local_runner

router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])


def _auth(websocket: WebSocket) -> dict | None:
    token = websocket.cookies.get("gpta_session")
    return database.get_user_by_session(token)


def _set_size(fd: int, cols: int, rows: int):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def _read_all(fd: int) -> bytes:
    chunks = []
    while True:
        try:
            chunk = os.read(fd, 65536)
        except (BlockingIOError, InterruptedError):
            break
        except OSError:
            break
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def _ssh_command(credential: dict | None, target: str, image: str) -> tuple[list[str], str | None, str]:
    """Build `docker run` args for an interactive ssh into target.

    Returns (docker_args, key_path, container_name). key_path is a tmp dir to
    clean up after the session when key auth was used.
    """
    container_name = f"gpta-term-{uuid.uuid4().hex[:12]}"
    docker_args = ["docker", "run", "--rm", "--network", "host", "-i", "-t",
                   "--user", "root", "--name", container_name]

    user = (credential or {}).get("username") or ""
    user_at = f"{user}@{target}" if user else target
    ssh_opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                "-o", "PreferredAuthentications=publickey,password",
                "-o", "KbdInteractiveAuthentication=no", "-tt"]
    sshtools_cmd = " ".join(["ssh", *ssh_opts, user_at])

    key_path = None
    if credential and credential.get("credential_type") == "ssh_key" and credential.get("private_key"):
        key_dir = config.RUNS_DIR / container_name
        key_dir.mkdir(parents=True, exist_ok=True)
        key_path = key_dir / "ssh_key"
        key_path.write_text(credential["private_key"].rstrip("\n") + "\n", encoding="utf-8")
        key_path.chmod(0o600)
        docker_args += ["-v", f"{key_path}:/ssh_key:z"]
        sshtools_cmd = " ".join(["ssh", *ssh_opts, "-i", "/ssh_key", "-o", "IdentitiesOnly=yes", user_at])
    elif credential and credential.get("credential_type") == "ssh_password" and credential.get("password"):
        docker_args += ["-e", f"SSHPASS={credential['password']}"]
        sshtools_cmd = " ".join(["sshpass", "-e", "ssh", *ssh_opts, user_at])

    docker_args += ["-e", "TERM=xterm-256color", "--entrypoint", "sh", image,
                    "-c", f"exec {sshtools_cmd}"]
    return docker_args, key_path, container_name


@router.websocket("/{host_id}")
async def host_terminal(websocket: WebSocket, host_id: int):
    user = _auth(websocket)
    if not user:
        await websocket.close(code=4401)
        return
    await websocket.accept()

    conn = database.get_connection()
    host = conn.execute("SELECT * FROM hosts WHERE id = %s", (host_id,)).fetchone()
    conn.close()
    if not host:
        await websocket.send_text("[error] host not found")
        await websocket.close()
        return

    try:
        msg = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4400)
        return

    credential_id = msg.get("credential_id") or msg.get("credentialId")
    credential = None
    if credential_id:
        conn = database.get_connection()
        credential = dict(conn.execute(
            "SELECT * FROM credentials WHERE id = %s", (credential_id,)).fetchone() or {})
        conn.close()

    target = host["ip_address"] or host["hostname"]
    image = local_runner._resolve_image()
    cmd, key_path, container_name = _ssh_command(credential, target, image)

    master, slave = pty.openpty()
    _set_size(master, msg.get("cols", 80) or 80, msg.get("rows", 24) or 24)
    os.set_blocking(master, False)

    try:
        proc = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave,
                                close_fds=True)
    except OSError as e:
        os.close(master)
        os.close(slave)
        await websocket.send_text(f"[error] failed to start terminal: {e}")
        await websocket.close()
        return
    os.close(slave)

    loop = asyncio.get_event_loop()
    closed = False

    async def _safe_send_bytes(data: bytes):
        if closed:
            return
        try:
            await websocket.send_bytes(data)
        except Exception:
            pass

    def on_master_readable():
        nonlocal closed
        if closed:
            return
        try:
            data = _read_all(master)
        except OSError:
            closed = True
            loop.create_task(_safe_close())
            return
        if not data:
            # Slave closed (container exited).
            closed = True
            loop.create_task(_safe_close())
            return
        if data:
            loop.create_task(_safe_send_bytes(data))

    async def _safe_close():
        if not closed:
            return
        try:
            await websocket.close()
        except Exception:
            pass

    loop.add_reader(master, on_master_readable)

    try:
        while True:
            try:
                data = await websocket.receive()
            except WebSocketDisconnect:
                break
            if data.get("type") == "websocket.disconnect":
                break
            if "bytes" in data and data["bytes"]:
                try:
                    os.write(master, data["bytes"])
                except OSError:
                    break
            elif "text" in data and data["text"]:
                try:
                    parsed = json.loads(data["text"])
                except ValueError:
                    os.write(master, data["text"].encode())
                    continue
                if parsed.get("type") == "resize":
                    _set_size(master, parsed.get("cols", 80), parsed.get("rows", 24))
                elif parsed.get("type") == "data":
                    os.write(master, parsed.get("data", "").encode())
                else:
                    os.write(master, data["text"].encode())
    finally:
        closed = True
        loop.remove_reader(master)
        os.close(master)
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        subprocess.run(["docker", "rm", "-f", container_name],
                       capture_output=True, timeout=15)
        if key_path and key_path.parent.exists():
            subprocess.run(["rm", "-rf", str(key_path.parent)], timeout=15)
