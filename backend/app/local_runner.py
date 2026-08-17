"""Self-hosted execution environment runner.

Runs an Ansible playbook in a Docker container image (AWX-style execution
environment) via ansible-runner, with no external AWX dependency.

Run layout (volume mounted into the container at /runner):
    <run_dir>/
        project/      playbook repo (cloned/pulled)
        inventory/    inventory hosts file
        env/          extravars + minimal envvars
        artifacts/    ansible-runner output (stdout etc.)

The playbooks themselves call back to GPTA's callback endpoints
(/updatepackages, /updatelatestpatch, ...) exactly like the AWX flow, so host
state lands in the DB the same way.
"""
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import config

DEFAULT_IMAGE = "quay.io/ansible/ansible-runner:stable-2.17-latest"

# Run type keyword -> playbook filename fallback when extra_vars.playbook is absent.
# Covers the built-in button/policy flows; custom playbooks are passed explicitly.
PLAYBOOK_BY_RUN_TYPE = {
    "manual": "onepatch_execution.yml",
    "scheduled": "onepatch_execution.yml",
    "apply": "onepatch_execution.yml",
    "snapshot": "onepatch_execution.yml",
    "check_updates": "check_updates.yml",
    "collect_packages": "collect_packages.yml",
}


def _run_id():
    now = datetime.now(timezone.utc)
    return f'{now.year}{now.month:02}{now.day:02}_{now.hour:02}{now.minute:02}{now.second:02}'


def _clone_project(run_dir: Path, repo_url: str, branch: str) -> None:
    project = run_dir / "project"
    project.mkdir(parents=True, exist_ok=True)
    if not (project / ".git").exists() and any(project.iterdir()):
        return
    if (project / ".git").exists():
        subprocess.run(["git", "-C", str(project), "fetch", "origin"], check=True,
                       capture_output=True, timeout=120)
        subprocess.run(["git", "-C", str(project), "checkout", branch], check=True,
                       capture_output=True, timeout=60)
    else:
        subprocess.run(["git", "clone", "--depth", "1", "-b", branch, repo_url, str(project)],
                       check=True, capture_output=True, timeout=180)


def _resolve_image(execution_environment_name: str | None = None) -> str:
    """EE image: named override, else the default EE, else env, else fallback."""
    from . import database
    conn = database.get_connection()
    rows = conn.execute("SELECT name, image FROM execution_environments ORDER BY is_default DESC, id").fetchall()
    conn.close()
    if execution_environment_name:
        for r in rows:
            if r["name"] == execution_environment_name:
                return r["image"]
    if rows:
        return rows[0]["image"]
    return os.getenv("EXECUTION_ENVIRONMENT_IMAGE", DEFAULT_IMAGE)


def _connection_vars(credential: dict | None) -> tuple[list[str], str | None]:
    """Inventory connection vars + ssh key content from a credential.

    Returns (host_var_tokens, ssh_key). The ssh key is written to the runner's
    env/ssh_key so ansible-runner adds it to the ssh-agent (documented layout).
    Password auth needs sshpass in the execution environment image.
    """
    if not credential:
        return [], None
    tokens = []
    if credential.get("username"):
        tokens.append(f"ansible_user={credential['username']}")
    if credential.get("credential_type") == "ssh_password" and credential.get("password"):
        tokens.append(f"ansible_ssh_pass={credential['password']}")
    ssh_key = credential.get("private_key") if credential.get("credential_type") == "ssh_key" else None
    return tokens, ssh_key


def run_playbook(*, run_id: str, repo_url: str, branch: str, playbook: str,
                 hostnames: list[str], extra_vars: dict,
                 execution_environment: str | None = None,
                 credential: dict | None = None) -> dict:
    """Execute a playbook via ansible-runner in a Docker execution environment.

    Returns dict(result): success, exit_code, output, artifacts_dir.
    """
    run_dir = config.DATA_DIR / "runs" / run_id
    if run_dir.exists():
        shutil.rmtree(run_dir)
    for d in ("project", "inventory", "env", "artifacts"):
        (run_dir / d).mkdir(parents=True, exist_ok=True)

    try:
        _clone_project(run_dir, repo_url, branch)
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"playbook repo clone failed: {e}",
                "exit_code": 1, "output": (e.stderr or b"").decode(errors="ignore")}

    # Inventory: one host per line, with SSH connection vars from the credential.
    conn_tokens, ssh_key = _connection_vars(credential)
    host_lines = [f"{h} {' '.join(conn_tokens)}" if conn_tokens else h for h in hostnames]
    (run_dir / "inventory" / "hosts").write_text(
        "\n".join(host_lines) if host_lines else "localhost\n", encoding="utf-8")

    if ssh_key:
        key_file = run_dir / "env" / "ssh_key"
        key_file.write_text(ssh_key if ssh_key.endswith("\n") else ssh_key + "\n", encoding="utf-8")
        key_file.chmod(0o600)

    extra = dict(extra_vars or {})
    extra.setdefault("run_id", run_id)
    extra.setdefault("server_endpoints_app", config.ENDPOINTS_BASE_URL)
    (run_dir / "env" / "extravars").write_text(json.dumps(extra), encoding="utf-8")
    (run_dir / "env" / "envvars").write_text(
        "ANSIBLE_NOCOLOR=True\nANSIBLE_FORCE_COLOR=False\n", encoding="utf-8")

    image = _resolve_image(execution_environment)
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{run_dir}:/runner", "--network", "host",
        image, "ansible-runner", "run", "/runner", "-p", playbook,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    output = (proc.stdout or "") + (proc.stderr or "")
    return {
        "success": proc.returncode == 0,
        "exit_code": proc.returncode,
        "output": output,
        "artifacts_dir": str(run_dir / "artifacts"),
        "image": image,
    }