from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database, inventory_sync
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/inventory-sources", tags=["inventory-sources"])


def _source_to_dict(row) -> dict:
    d = dict(row)
    for secret in ("password", "token"):
        if d.get(secret):
            d[secret] = "********"
    return d


class SourceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    repo_url: str
    branch: str = "main"
    auth_type: str = "none"  # none | token | ssh | userpass
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    file_pattern: str = "**/*"
    playbook_pattern: str = "ansible_scripts/*.yml"
    prune_missing: bool = False
    enabled: bool = True


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    branch: Optional[str] = None
    auth_type: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    file_pattern: Optional[str] = None
    playbook_pattern: Optional[str] = None
    prune_missing: Optional[bool] = None
    enabled: Optional[bool] = None


def _validate(body: SourceCreate | SourceUpdate):
    if body.name is not None and not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    url = body.repo_url if hasattr(body, "repo_url") else getattr(body, "repo_url", None)
    if url is not None and not (url.startswith(("http://", "https://", "git@", "ssh://", "file://"))):
        raise HTTPException(status_code=400, detail="repo_url must be a git http(s)/ssh URL")


@router.get("")
def list_sources(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM inventory_sources ORDER BY name").fetchall()
    # run lazily so host counts include per-source hosts
    out = []
    for r in rows:
        d = _source_to_dict(r)
        host_count = conn.execute(
            "SELECT COUNT(*) AS c FROM hosts h JOIN host_groups g ON g.id = h.group_id "
            "WHERE g.description LIKE %s", (f"Synced from {d['name']}%",)).fetchone()["c"]
        template_count = conn.execute(
            "SELECT COUNT(*) AS c FROM templates WHERE inventory_source_id = %s", (d["id"],)).fetchone()["c"]
        d["host_count"] = host_count
        d["template_count"] = template_count
        out.append(d)
    conn.close()
    return {"success": True, "sources": out}


@router.get("/{source_id}")
def get_source(source_id: int, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True, "source": _source_to_dict(row)}


@router.post("")
def create_source(body: SourceCreate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO inventory_sources (name, description, repo_url, branch, auth_type, username, password, token, "
            "file_pattern, playbook_pattern, prune_missing, enabled, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.name.strip(), body.description, body.repo_url.strip(), body.branch or "main", body.auth_type,
             body.username, body.password, body.token,
             body.file_pattern, body.playbook_pattern, int(body.prune_missing), int(body.enabled), now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Source name already exists")
    conn.commit()
    source_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    conn.close()
    return {"success": True, "source": _source_to_dict(row)}


@router.put("/{source_id}")
def update_source(source_id: int, body: SourceUpdate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Source not found")
    sets, params = [], []
    for field in ("name", "description", "repo_url", "branch", "auth_type", "username", "password", "token", "file_pattern", "playbook_pattern"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field} = %s")
            params.append(val.strip() if isinstance(val, str) else val)
    for field in ("prune_missing", "enabled"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field} = %s")
            params.append(int(val))
    if not sets:
        conn.close()
        return {"success": True, "source": _source_to_dict(existing)}
    sets.append("updated_at = %s")
    params.append(database.now_iso())
    params.append(source_id)
    conn.execute(f"UPDATE inventory_sources SET {', '.join(sets)} WHERE id = %s", params)
    conn.commit()
    row = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    conn.close()
    return {"success": True, "source": _source_to_dict(row)}


@router.delete("/{source_id}")
def delete_source(source_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM inventory_sources WHERE id = %s", (source_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True}


@router.post("/{source_id}/sync")
def run_sync(source_id: int, _user: dict = Depends(require_admin)):
    return inventory_sync.sync_source(source_id)