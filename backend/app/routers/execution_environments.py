from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/execution-environment", tags=["execution-environment"])


class EECreate(BaseModel):
    name: str
    image: str
    description: Optional[str] = None
    is_default: bool = False


class EEUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None


def _ee_to_dict(row) -> dict:
    return dict(row)


def _validate_ee(body: EECreate | EEUpdate):
    if body.image is not None and not body.image.strip():
        raise HTTPException(status_code=400, detail="image is required")


@router.get("")
def list_ees(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM execution_environments ORDER BY is_default DESC, name").fetchall()
    conn.close()
    return {"success": True, "environments": [_ee_to_dict(r) for r in rows]}


@router.post("")
def create_ee(body: EECreate, _user: dict = Depends(require_admin)):
    _validate_ee(body)
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO execution_environments (name, image, description, is_default, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (body.name.strip(), body.image.strip(), body.description, int(body.is_default), now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="An execution environment with that name already exists")
    conn.commit()
    ee_id = cur.fetchone()["id"]
    # Only one default at a time.
    if body.is_default:
        conn.execute("UPDATE execution_environments SET is_default = 0 WHERE id <> %s", (ee_id,))
        conn.commit()
    row = conn.execute("SELECT * FROM execution_environments WHERE id = %s", (ee_id,)).fetchone()
    conn.close()
    return {"success": True, "environment": _ee_to_dict(row)}


@router.put("/{ee_id}")
def update_ee(ee_id: int, body: EEUpdate, _user: dict = Depends(require_admin)):
    _validate_ee(body)
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM execution_environments WHERE id = %s", (ee_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Execution environment not found")
    sets, params = [], []
    for f in ("name", "image", "description"):
        val = getattr(body, f)
        if val is not None:
            sets.append(f"{f} = %s")
            params.append(val.strip() if isinstance(val, str) else val)
    if body.is_default is not None:
        sets.append("is_default = %s")
        params.append(int(body.is_default))
    if not sets:
        conn.close()
        return {"success": True, "environment": _ee_to_dict(existing)}
    sets.append("updated_at = %s")
    params.append(database.now_iso())
    params.append(ee_id)
    conn.execute(f"UPDATE execution_environments SET {', '.join(sets)} WHERE id = %s", params)
    if body.is_default:
        conn.execute("UPDATE execution_environments SET is_default = 0 WHERE id <> %s", (ee_id,))
    conn.commit()
    row = conn.execute("SELECT * FROM execution_environments WHERE id = %s", (ee_id,)).fetchone()
    conn.close()
    return {"success": True, "environment": _ee_to_dict(row)}


@router.delete("/{ee_id}")
def delete_ee(ee_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM execution_environments WHERE id = %s", (ee_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Execution environment not found")
    return {"success": True}