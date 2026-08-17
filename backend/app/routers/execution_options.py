from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import awx, database
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/patching/options", tags=["patching-options"])


def _option_to_dict(row) -> dict:
    d = dict(row)
    return d


class OptionCreate(BaseModel):
    name: str
    provider: str = "awx"  # awx | jenkins (future)
    url: str
    auth_mode: str = "basic"  # basic | token
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None


class OptionUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    url: Optional[str] = None
    auth_mode: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None


def _validate(body: OptionCreate | OptionUpdate):
    if body.provider is not None and body.provider not in ("awx", "jenkins", "local"):
        raise HTTPException(status_code=400, detail="provider must be 'awx', 'jenkins' or 'local'")
    if body.provider == "local":
        # local provider: `url` is the playbook git repository
        return
    if body.url is not None and not body.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url must start with http:// or https://")
    if body.auth_mode is not None and body.auth_mode not in ("basic", "token"):
        raise HTTPException(status_code=400, detail="auth_mode must be 'basic' or 'token'")


def _row_to_connection(row) -> dict:
    return {"id": row["id"], "name": row["name"], "provider": row["provider"], "url": row["url"],
            "auth_mode": row["auth_mode"], "username": row["username"], "password": row["password"],
            "token": row["token"]}


@router.get("")
def list_options(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM execution_options ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "options": [_option_to_dict(r) for r in rows]}


@router.post("")
def create_option(body: OptionCreate, _user: dict = Depends(require_admin)):
    _validate(body)
    if body.auth_mode == "basic" and (not body.username or not body.password):
        raise HTTPException(status_code=400, detail="username and password required for basic auth")
    if body.auth_mode == "token" and not body.token:
        raise HTTPException(status_code=400, detail="token required for token auth")
    conn = database.get_connection()
    now = database.now_iso()
    was_active = conn.execute("SELECT COUNT(*) AS c FROM execution_options WHERE is_active = 1").fetchone()["c"] == 0
    try:
        cur = conn.execute(
            "INSERT INTO execution_options (name, provider, url, auth_mode, username, password, token, is_active, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.name.strip(), body.provider, body.url.strip(), body.auth_mode, body.username, body.password,
             body.token, int(was_active), now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Option name already exists")
    conn.commit()
    option_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM execution_options WHERE id = %s", (option_id,)).fetchone()
    conn.close()
    return {"success": True, "option": _option_to_dict(row)}


@router.put("/{option_id}")
def update_option(option_id: int, body: OptionUpdate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM execution_options WHERE id = %s", (option_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Option not found")
    sets, params = [], []
    for field in ("name", "provider", "url", "auth_mode", "username", "password", "token"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field} = %s")
            params.append(val.strip() if isinstance(val, str) else val)
    if not sets:
        conn.close()
        return {"success": True, "option": _option_to_dict(existing)}
    sets.append("updated_at = %s")
    params.append(database.now_iso())
    params.append(option_id)
    conn.execute(f"UPDATE execution_options SET {', '.join(sets)} WHERE id = %s", params)
    conn.commit()
    row = conn.execute("SELECT * FROM execution_options WHERE id = %s", (option_id,)).fetchone()
    conn.close()
    return {"success": True, "option": _option_to_dict(row)}


@router.delete("/{option_id}")
def delete_option(option_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM execution_options WHERE id = %s", (option_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Option not found")
    return {"success": True}


@router.post("/{option_id}/activate")
def activate_option(option_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM execution_options WHERE id = %s", (option_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Option not found")
    conn.execute("UPDATE execution_options SET is_active = 0")
    conn.execute("UPDATE execution_options SET is_active = 1, updated_at = %s WHERE id = %s",
                 (database.now_iso(), option_id))
    conn.commit()
    row = conn.execute("SELECT * FROM execution_options WHERE id = %s", (option_id,)).fetchone()
    conn.close()
    return {"success": True, "option": _option_to_dict(row)}


@router.post("/{option_id}/test")
def test_option(option_id: int, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM execution_options WHERE id = %s", (option_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Option not found")
    return awx.get_awx_health(_row_to_connection(row))