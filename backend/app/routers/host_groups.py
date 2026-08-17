from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import require_admin

router = APIRouter(prefix="/api/v1/host-groups", tags=["host-groups"])


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.get("")
def list_groups(_user: dict = Depends(require_admin)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM host_groups ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "groups": [dict(r) for r in rows]}


@router.post("")
def create_group(body: GroupCreate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    try:
        cur = conn.execute("INSERT INTO host_groups (name, description) VALUES (%s, %s) RETURNING id",
                           (body.name, body.description))
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Group name already exists")
    conn.commit()
    group_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM host_groups WHERE id = %s", (group_id,)).fetchone()
    conn.close()
    return {"success": True, "group": dict(row)}


@router.patch("/{group_id}")
def update_group(group_id: int, body: GroupUpdate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    fields = ["name", "description"]
    sets, params = [], []
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            sets.append(f"{f} = %s")
            params.append(val)
    if not sets:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(group_id)
    conn.execute(f"UPDATE host_groups SET {', '.join(sets)} WHERE id = %s", params)
    conn.commit()
    row = conn.execute("SELECT * FROM host_groups WHERE id = %s", (group_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True, "group": dict(row)}


@router.delete("/{group_id}")
def delete_group(group_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    conn.execute("UPDATE hosts SET group_id = NULL WHERE group_id = %s", (group_id,))
    cur = conn.execute("DELETE FROM host_groups WHERE id = %s", (group_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True}
