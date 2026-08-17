from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import require_admin

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _public_user(row) -> dict:
    user = dict(row)
    user.pop("password_hash", None)
    return user


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    is_admin: bool = False


class UserUpdate(BaseModel):
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


@router.get("")
def list_users(_user: dict = Depends(require_admin)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
    conn.close()
    return {"success": True, "users": [_public_user(r) for r in rows]}


@router.post("")
def create_user(body: UserCreate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, email, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
            (body.username, body.email, database.hash_password(body.password), int(body.is_admin), database.now_iso()),
        )
    except database.sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Username already exists")
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"success": True, "user": _public_user(row)}


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    fields = ["email", "is_admin", "is_active"]
    sets, params = [], []
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            sets.append(f"{f} = ?")
            params.append(int(val) if isinstance(val, bool) else val)
    if body.password:
        sets.append("password_hash = ?")
        params.append(database.hash_password(body.password))
    if not sets:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "user": _public_user(row)}


@router.delete("/{user_id}")
def delete_user(user_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}
