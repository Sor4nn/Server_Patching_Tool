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
        g = conn.execute("SELECT id, name FROM host_groups WHERE id = %s", (row["group_id"],)).fetchone()
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
    query = ("SELECT h.*,"
             " (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1) AS outdated_count,"
             " (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1"
             "   AND hp.is_security_update = 1) AS security_count"
             " FROM hosts h")
    params = []
    where = []
    if group_id:
        where.append("h.group_id = %s")
        params.append(group_id)
    if search:
        where.append("(h.hostname LIKE %s OR h.ip_address LIKE %s OR h.friendly_name LIKE %s)")
        params += [f"%{search}%"] * 3
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY h.hostname"
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
    row = conn.execute("SELECT * FROM hosts WHERE id = %s", (host_id,)).fetchone()
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
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.hostname, body.ip_address, body.os_make, body.os_version, body.friendly_name, body.group_id, now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Hostname already exists")
    conn.commit()
    host_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM hosts WHERE id = %s", (host_id,)).fetchone()
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
            sets.append(f"{f} = %s")
            params.append(val)
    if not sets:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(host_id)
    conn.execute(f"UPDATE hosts SET {', '.join(sets)}, updated_at = %s WHERE id = %s", params + [database.now_iso(), host_id])
    conn.commit()
    row = conn.execute("SELECT * FROM hosts WHERE id = %s", (host_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True, "host": _host_row_to_dict(row)}


@router.get("/{host_id}/packages")
def get_host_packages(host_id: int, search: Optional[str] = None, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    host = conn.execute("SELECT id FROM hosts WHERE id = %s", (host_id,)).fetchone()
    if not host:
        conn.close()
        raise HTTPException(status_code=404, detail="Host not found")
    query = "SELECT * FROM host_packages WHERE host_id = %s"
    params = [host_id]
    if search:
        query += " AND name LIKE %s"
        params.append(f"%{search}%")
    query += " ORDER BY name"
    rows = conn.execute(query, params).fetchall()
    count = conn.execute("SELECT COUNT(*) AS c FROM host_packages WHERE host_id = %s", (host_id,)).fetchone()["c"]
    conn.close()
    return {"success": True, "packages": [dict(r) for r in rows], "count": count}


@router.delete("/{host_id}")
def delete_host(host_id: int, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM hosts WHERE id = %s", (host_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True}
