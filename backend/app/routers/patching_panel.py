from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user, require_admin
from .patching import orchestrate_run

router = APIRouter(prefix="/api/v1/patching", tags=["patching-panel"])


@router.get("/tree")
def patch_tree(_user: dict = Depends(current_user)):
    """Per-host patch tree: what's installed (current) vs what's available (new)."""
    conn = database.get_connection()
    hosts = conn.execute("SELECT * FROM hosts ORDER BY hostname").fetchall()
    tree = []
    for host in hosts:
        pkgs = conn.execute(
            "SELECT * FROM host_packages WHERE host_id = ? ORDER BY name", (host["id"],)
        ).fetchall()
        current, new = [], []
        for p in pkgs:
            item = {
                "name": p["name"], "version": p["version"], "release": p["release"],
                "arch": p["arch"], "category": p["category"],
            }
            if p["needs_update"]:
                item["available_version"] = p["available_version"]
                item["is_security_update"] = p["is_security_update"]
                new.append(item)
            else:
                current.append(item)
        tree.append({
            "host": dict(host),
            "current": current,
            "new": new,
        })
    conn.close()
    return {"success": True, "tree": tree}


def _button_to_dict(row) -> dict:
    d = dict(row)
    return d


class ButtonBind(BaseModel):
    template_id: Optional[int] = None
    button_label: Optional[str] = None


@router.get("/buttons")
def list_buttons(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM button_bindings ORDER BY button_key").fetchall()
    conn.close()
    return {"success": True, "buttons": [_button_to_dict(r) for r in rows]}


@router.put("/buttons/{button_key}")
def bind_button(button_key: str, body: ButtonBind, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    now = database.now_iso()
    conn.execute(
        "INSERT INTO button_bindings (button_key, button_label, template_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(button_key) DO UPDATE SET button_label = excluded.button_label, template_id = excluded.template_id, updated_at = excluded.updated_at",
        (button_key, body.button_label or button_key, body.template_id, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM button_bindings WHERE button_key = ?", (button_key,)).fetchone()
    conn.close()
    return {"success": True, "button": _button_to_dict(row)}


@router.delete("/buttons/{button_key}")
def unbind_button(button_key: str, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    conn.execute("DELETE FROM button_bindings WHERE button_key = ?", (button_key,))
    conn.commit()
    conn.close()
    return {"success": True}


class ButtonTrigger(BaseModel):
    host_ids: Optional[list[int]] = None


@router.post("/buttons/{button_key}/trigger")
def trigger_button(button_key: str, body: ButtonTrigger, user: dict = Depends(require_admin)):
    """Run the AWX template bound to a button against the given hosts."""
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM button_bindings WHERE button_key = ?", (button_key,)).fetchone()
    if not row or not row["template_id"]:
        conn.close()
        raise HTTPException(status_code=400, detail=f"No template bound to the '{button_key}' button yet")
    try:
        result = orchestrate_run(conn, row["template_id"], body.host_ids or [], {}, user["username"], button_key)
    finally:
        conn.close()
    return result