from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/hosts", tags=["hosts"])


def _host_row_to_dict(row) -> dict:
    host = dict(row)
    host["group"] = None
    if row["group_id"]:
        conn = database.get_connection()
        g = conn.execute("SELECT id, name FROM host_groups WHERE id = ?", (row["group_id"],)).fetchone()
        conn.close()
        if g:
            host["group"] = {"id": g["id"], "name": g["name"]}
    return host


class HostCreate(BaseModel):
    hostname: str
    ip_address: Optional[str] = None
    os_make: Optional[str] = None
    os_version: Optional[str] = None
    friendly_name: Optional[str] = None
    group_id: Optional[int] = None


class HostUpdate(BaseModel):
    ip_address: Optional[str] = None
    os_make: Optional[str] = None
    os_version: Optional[str] = None
    friendly_name: Optional[str] = None
    group_id: Optional[int] = None
    remarks: Optional[str] = None


@router.get("")
def list_hosts(group_id: Optional[int] = None, search: Optional[str] = None, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    query = "SELECT * FROM hosts"
    params = []
    where = []
    if group_id:
        where.append("group_id = ?")
        params.append(group_id)
    if search:
        where.append("(hostname LIKE ? OR ip_address LIKE ? OR friendly_name LIKE ?)")
        params += [f"%{search}%"] * 3
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY hostname"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return {"success": True, "hosts": [_host_row_to_dict(r) for r in rows]}


@router.get("/stats")
def host_stats(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    total = conn.execute("SELECT COUNT(*) AS c FROM hosts").fetchone()["c"]
    blocked = conn.execute("SELECT COUNT(*) AS c FROM hosts WHERE state = 'Blocked'").fetchone()["c"]
    completed = conn.execute("SELECT COUNT(*) AS c FROM hosts WHERE state = 'Completed'").fetchone()["c"]
    in_progress = conn.execute("SELECT COUNT(*) AS c FROM hosts WHERE state = 'Inprogress'").fetchone()["c"]
    conn.close()
    return {"success": True, "total": total, "blocked": blocked, "completed": completed, "in_progress": in_progress}


@router.get("/{host_id}")
def get_host(host_id: int, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM hosts WHERE id = ?", (host_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True, "host": _host_row_to_dict(row)}


@router.post("")
def create_host(body: HostCreate, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO hosts (hostname, ip_address, os_make, os_version, friendly_name, group_id, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (body.hostname, body.ip_address, body.os_make, body.os_version, body.friendly_name, body.group_id, now, now),
        )
    except database.sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Hostname already exists")
    conn.commit()
    row = conn.execute("SELECT * FROM hosts WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"success": True, "host": _host_row_to_dict(row)}


@router.patch("/{host_id}")
def update_host(host_id: int, body: HostUpdate, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    fields = ["ip_address", "os_make", "os_version", "friendly_name", "group_id", "remarks"]
    sets, params = [], []
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            sets.append(f"{f} = ?")
            params.append(val)
    if not sets:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(host_id)
    conn.execute(f"UPDATE hosts SET {', '.join(sets)}, updated_at = ? WHERE id = ?", params + [database.now_iso(), host_id])
    conn.commit()
    row = conn.execute("SELECT * FROM hosts WHERE id = ?", (host_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True, "host": _host_row_to_dict(row)}


@router.delete("/{host_id}")
def delete_host(host_id: int, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM hosts WHERE id = ?", (host_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True}
