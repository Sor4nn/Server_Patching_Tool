from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/credentials", tags=["credentials"])

MASK = "********"


def _cred_to_dict(row) -> dict:
    d = dict(row)
    for secret in ("password", "private_key"):
        if d.get(secret):
            d[secret] = MASK
    return d


class CredCreate(BaseModel):
    name: str
    credential_type: str  # ssh_key | ssh_password
    username: Optional[str] = None
    password: Optional[str] = None
    private_key: Optional[str] = None
    description: Optional[str] = None


class CredUpdate(BaseModel):
    name: Optional[str] = None
    credential_type: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    private_key: Optional[str] = None
    description: Optional[str] = None


def _validate(body: CredCreate | CredUpdate):
    ctype = body.credential_type
    if ctype is not None and ctype not in ("ssh_key", "ssh_password"):
        raise HTTPException(status_code=400, detail="credential_type must be 'ssh_key' or 'ssh_password'")
    if body.name is not None and not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")


@router.get("")
def list_credentials(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM credentials ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "credentials": [_cred_to_dict(r) for r in rows]}


@router.post("")
def create_credential(body: CredCreate, _user: dict = Depends(require_admin)):
    _validate(body)
    if body.credential_type == "ssh_key" and not body.private_key:
        raise HTTPException(status_code=400, detail="private key is required for ssh_key type")
    if body.credential_type == "ssh_password" and not body.password:
        raise HTTPException(status_code=400, detail="password is required for ssh_password type")
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO credentials (name, credential_type, username, password, private_key, description, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.name.strip(), body.credential_type, body.username, body.password, body.private_key,
             body.description, now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Credential name already exists")
    conn.commit()
    cred_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM credentials WHERE id = %s", (cred_id,)).fetchone()
    conn.close()
    return {"success": True, "credential": _cred_to_dict(row)}


@router.put("/{cred_id}")
def update_credential(cred_id: int, body: CredUpdate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM credentials WHERE id = %s", (cred_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Credential not found")
    sets, params = [], []
    for field in ("name", "credential_type", "username", "description"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field} = %s")
            params.append(val.strip() if isinstance(val, str) else val)
    # Secrets only overwritten when actually supplied.
    for field in ("password", "private_key"):
        val = getattr(body, field)
        if val is not None and val != MASK:
            sets.append(f"{field} = %s")
            params.append(val)
    if not sets:
        conn.close()
        return {"success": True, "credential": _cred_to_dict(existing)}
    sets.append("updated_at = %s")
    params.append(database.now_iso())
    params.append(cred_id)
    conn.execute(f"UPDATE credentials SET {', '.join(sets)} WHERE id = %s", params)
    conn.commit()
    row = conn.execute("SELECT * FROM credentials WHERE id = %s", (cred_id,)).fetchone()
    conn.close()
    return {"success": True, "credential": _cred_to_dict(row)}


@router.delete("/{cred_id}")
def delete_credential(cred_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM credentials WHERE id = %s", (cred_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"success": True}