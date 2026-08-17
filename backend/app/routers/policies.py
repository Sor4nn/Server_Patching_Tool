from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import require_admin

router = APIRouter(prefix="/api/v1/patching/policies", tags=["patching-policies"])


def _policy_to_dict(row) -> dict:
    p = dict(row)
    conn = database.get_connection()
    p["assignments"] = [dict(a) for a in
                        conn.execute("SELECT * FROM policy_assignments WHERE policy_id = ?", (p["id"],)).fetchall()]
    p["exclusions"] = [dict(e) for e in
                       conn.execute("SELECT * FROM policy_exclusions WHERE policy_id = ?", (p["id"],)).fetchall()]
    conn.close()
    return p


class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    patch_delay_type: str = "immediate"  # immediate | delayed | fixed_time
    delay_minutes: Optional[int] = None
    fixed_time_utc: Optional[str] = None
    template_id: Optional[int] = None


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    patch_delay_type: Optional[str] = None
    delay_minutes: Optional[int] = None
    fixed_time_utc: Optional[str] = None
    template_id: Optional[int] = None
    enabled: Optional[bool] = None


class Assignment(BaseModel):
    target_type: str  # host | host_group
    target_id: int


@router.get("")
def list_policies(_user: dict = Depends(require_admin)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM patch_policies ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "policies": [_policy_to_dict(r) for r in rows]}


@router.get("/{policy_id}")
def get_policy(policy_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM patch_policies WHERE id = ?", (policy_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"success": True, "policy": _policy_to_dict(row)}


@router.post("")
def create_policy(body: PolicyCreate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO patch_policies (name, description, patch_delay_type, delay_minutes, fixed_time_utc, template_id, enabled, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
            (body.name.strip(), body.description, body.patch_delay_type, body.delay_minutes, body.fixed_time_utc,
             body.template_id, now, now),
        )
    except database.sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Policy name already exists")
    conn.commit()
    row = conn.execute("SELECT * FROM patch_policies WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"success": True, "policy": _policy_to_dict(row)}


@router.put("/{policy_id}")
def update_policy(policy_id: int, body: PolicyUpdate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM patch_policies WHERE id = ?", (policy_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Policy not found")
    sets, params = [], []
    for f, val in (("name", body.name), ("description", body.description), ("patch_delay_type", body.patch_delay_type),
                   ("delay_minutes", body.delay_minutes), ("fixed_time_utc", body.fixed_time_utc),
                   ("template_id", body.template_id)):
        if val is not None:
            sets.append(f"{f} = ?")
            params.append(val if not isinstance(val, str) or not val.strip() == "" else None)
    if body.enabled is not None:
        sets.append("enabled = ?")
        params.append(int(body.enabled))
    sets.append("updated_at = ?")
    params.append(database.now_iso())
    params.append(policy_id)
    conn.execute(f"UPDATE patch_policies SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT * FROM patch_policies WHERE id = ?", (policy_id,)).fetchone()
    conn.close()
    return {"success": True, "policy": _policy_to_dict(row)}


@router.delete("/{policy_id}")
def delete_policy(policy_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM patch_policies WHERE id = ?", (policy_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"success": True}


@router.post("/{policy_id}/assignments")
def add_assignment(policy_id: int, body: Assignment, _user: dict = Depends(require_admin)):
    if body.target_type not in ("host", "host_group"):
        raise HTTPException(status_code=400, detail="target_type must be 'host' or 'host_group'")
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM patch_policies WHERE id = ?", (policy_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Policy not found")
    try:
        conn.execute("INSERT OR IGNORE INTO policy_assignments (policy_id, target_type, target_id) VALUES (?, ?, ?)",
                     (policy_id, body.target_type, body.target_id))
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.commit()
    conn.close()
    return {"success": True}


@router.delete("/{policy_id}/assignments/{assignment_id}")
def remove_assignment(policy_id: int, assignment_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM policy_assignments WHERE id = ? AND policy_id = ?", (assignment_id, policy_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"success": True}


@router.post("/{policy_id}/exclusions")
def add_exclusion(policy_id: int, host_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM patch_policies WHERE id = ?", (policy_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Policy not found")
    conn.execute("INSERT OR IGNORE INTO policy_exclusions (policy_id, host_id) VALUES (?, ?)", (policy_id, host_id))
    conn.commit()
    conn.close()
    return {"success": True}


@router.delete("/{policy_id}/exclusions/{exclusion_id}")
def remove_exclusion(policy_id: int, exclusion_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM policy_exclusions WHERE id = ? AND policy_id = ?", (exclusion_id, policy_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Exclusion not found")
    return {"success": True}
