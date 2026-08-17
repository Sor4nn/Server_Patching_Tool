from typing import Optional

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import config, database
from .auth import current_user, require_admin
from .patching import _new_run_id, run_local_playbook

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


def _template_to_dict(row) -> dict:
    d = dict(row)
    conn = database.get_connection()
    if d.get("credential_id"):
        c = conn.execute("SELECT name, credential_type, username FROM credentials WHERE id = %s",
                         (d["credential_id"],)).fetchone()
        d["credential"] = dict(c) if c else None
    if d.get("execution_environment_id"):
        e = conn.execute("SELECT name, image FROM execution_environments WHERE id = %s",
                         (d["execution_environment_id"],)).fetchone()
        d["execution_environment"] = dict(e) if e else None
    conn.close()
    return d


class TemplateCreate(BaseModel):
    name: str
    playbook: str
    repo_url: str
    branch: str = "main"
    description: Optional[str] = None
    credential_id: Optional[int] = None
    execution_environment_id: Optional[int] = None
    enabled: bool = True


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    playbook: Optional[str] = None
    repo_url: Optional[str] = None
    branch: Optional[str] = None
    description: Optional[str] = None
    credential_id: Optional[int] = None
    execution_environment_id: Optional[int] = None
    enabled: Optional[bool] = None


class TemplateRun(BaseModel):
    host_ids: list[int]
    extra_vars: Optional[str] = None  # JSON string


def _validate(body: TemplateCreate | TemplateUpdate):
    if body.name is not None and not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if body.repo_url is not None and not body.repo_url.startswith(("http://", "https://", "git@", "ssh://")):
        raise HTTPException(status_code=400, detail="repo_url must be a git http(s)/ssh URL")


@router.get("")
def list_templates(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM templates ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "templates": [_template_to_dict(r) for r in rows]}


@router.post("")
def create_template(body: TemplateCreate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    now = database.now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO templates (name, description, playbook, repo_url, branch, credential_id, execution_environment_id, enabled, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.name.strip(), body.description, body.playbook.strip(), body.repo_url.strip(),
             body.branch or "main", body.credential_id, body.execution_environment_id,
             int(body.enabled), now, now),
        )
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Template name already exists")
    conn.commit()
    tpl_id = cur.fetchone()["id"]
    row = conn.execute("SELECT * FROM templates WHERE id = %s", (tpl_id,)).fetchone()
    conn.close()
    return {"success": True, "template": _template_to_dict(row)}


@router.put("/{tpl_id}")
def update_template(tpl_id: int, body: TemplateUpdate, _user: dict = Depends(require_admin)):
    _validate(body)
    conn = database.get_connection()
    existing = conn.execute("SELECT * FROM templates WHERE id = %s", (tpl_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found")
    sets, params = [], []
    for field in ("name", "description", "playbook", "repo_url", "branch", "credential_id", "execution_environment_id"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field} = %s")
            params.append(val.strip() if isinstance(val, str) else val)
    if body.enabled is not None:
        sets.append("enabled = %s")
        params.append(int(body.enabled))
    if not sets:
        conn.close()
        return {"success": True, "template": _template_to_dict(existing)}
    sets.append("updated_at = %s")
    params.append(database.now_iso())
    params.append(tpl_id)
    conn.execute(f"UPDATE templates SET {', '.join(sets)} WHERE id = %s", params)
    conn.commit()
    row = conn.execute("SELECT * FROM templates WHERE id = %s", (tpl_id,)).fetchone()
    conn.close()
    return {"success": True, "template": _template_to_dict(row)}


@router.delete("/{tpl_id}")
def delete_template(tpl_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM templates WHERE id = %s", (tpl_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


@router.post("/{tpl_id}/run")
def run_template(tpl_id: int, body: TemplateRun, user: dict = Depends(require_admin)):
    """Launch the template's playbook against the given hosts (local runner)."""
    conn = database.get_connection()
    tpl = conn.execute("SELECT * FROM templates WHERE id = %s", (tpl_id,)).fetchone()
    if not tpl:
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found")
    if not tpl["enabled"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Template is disabled")
    if not body.host_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="At least one host is required")

    placeholders = ",".join(["%s"] * len(body.host_ids))
    hostnames = [dict(h) for h in conn.execute(
        f"SELECT hostname, ip_address FROM hosts WHERE id IN ({placeholders})", body.host_ids).fetchall()]

    extra_vars = {}
    if body.extra_vars:
        try:
            extra_vars = json.loads(body.extra_vars)
        except json.JSONDecodeError:
            conn.close()
            raise HTTPException(status_code=400, detail="extra_vars must be valid JSON")

    credential = None
    if tpl["credential_id"]:
        c = conn.execute("SELECT name, credential_type, username, password, private_key FROM credentials WHERE id = %s",
                         (tpl["credential_id"],)).fetchone()
        if c:
            credential = dict(c)

    ee = None
    if tpl["execution_environment_id"]:
        ee_row = conn.execute("SELECT name FROM execution_environments WHERE id = %s",
                              (tpl["execution_environment_id"],)).fetchone()
        ee = ee_row["name"] if ee_row else None
    conn.close()

    run_id = _new_run_id()
    csv_path = config.USER_FILES / f"{run_id}_{tpl['name']}.csv"
    with open(csv_path, "w") as f:
        f.write("host\n")
        for h in hostnames:
            f.write(f"{h['hostname']}\n")

    return run_local_playbook(
        conn=database.get_connection(),
        run_id=run_id,
        repo_url=tpl["repo_url"],
        branch=tpl["branch"],
        playbook=tpl["playbook"],
        hostnames=hostnames,
        extra_vars=extra_vars,
        username=user["username"],
        run_type=tpl["name"],
        execution_environment=ee,
        credential=credential,
    )