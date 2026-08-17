from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .. import config, database

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def current_user(request: Request):
    token = request.cookies.get("gpta_session")
    user = database.get_user_by_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(user: dict = Depends(current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
def login(body: LoginRequest, response: Response):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM users WHERE username = %s", (body.username,)).fetchone()
    if not row or not database.verify_password(body.password, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not row["is_active"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Account is disabled")
    token = database.create_session(conn, row["id"])
    conn.execute("UPDATE users SET last_login = %s WHERE id = %s", (database.now_iso(), row["id"]))
    conn.commit()
    user = dict(conn.execute("SELECT * FROM users WHERE id = %s", (row["id"],)).fetchone())
    conn.close()
    user.pop("password_hash", None)
    response.set_cookie("gpta_session", token, httponly=True, samesite="lax",
                        max_age=config.SESSION_TTL_DAYS * 86400)
    return {"success": True, "user": user}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("gpta_session")
    if token:
        database.delete_session(token)
    response.delete_cookie("gpta_session")
    return {"success": True}


@router.get("/profile")
def profile(user: dict = Depends(current_user)):
    return {"success": True, "user": user}


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = %s", (user["id"],)).fetchone()
    if not database.verify_password(body.old_password, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    conn.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                 (database.hash_password(body.new_password), user["id"]))
    conn.commit()
    conn.close()
    return {"success": True}
