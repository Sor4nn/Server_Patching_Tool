import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import awx, config, database
from .auth import current_user, require_admin

router = APIRouter(prefix="/api/v1/patching", tags=["patching"])


class TriggerRun(BaseModel):
    template_id: int
    host_ids: Optional[list[int]] = None
    extra_vars: Optional[str] = None


def _new_run_id() -> str:
    now = datetime.now(timezone.utc)
    return f'{now.year}{now.month:02}{now.day:02}_{now.hour:02}{now.minute:02}{now.second:02}'


def _run_to_dict(row) -> dict:
    return dict(row)


@router.get("/health")
def health(_user: dict = Depends(current_user)):
    return awx.get_awx_health()


@router.get("/templates")
def templates(_user: dict = Depends(current_user)):
    return awx.get_job_templates_list()


@router.get("/jobs")
def jobs(status: Optional[str] = None, _user: dict = Depends(current_user)):
    return awx.get_jobs(status=status)


@router.get("/jobs/{job_id}")
def job_detail(job_id: int, _user: dict = Depends(current_user)):
    return awx.get_job(job_id)


@router.get("/runs")
def runs(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM patch_runs ORDER BY id DESC LIMIT 50").fetchall()
    conn.close()
    return {"success": True, "runs": [_run_to_dict(r) for r in rows]}


@router.post("/runs")
def create_run(body: TriggerRun, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    run_id = _new_run_id()
    template_name = None

    if body.template_id:
        tpl = awx.get_job_template_data(body.template_id)
        template_name = tpl.get("name", f"template-{body.template_id}")

    host_count = len(body.host_ids or [])
    hostnames = []
    if body.host_ids:
        placeholders = ",".join("?" * len(body.host_ids))
        hostnames = [r["hostname"] for r in
                     conn.execute(f"SELECT hostname FROM hosts WHERE id IN ({placeholders})", body.host_ids).fetchall()]

    cur = conn.execute(
        "INSERT INTO patch_runs (run_id, template_id, template_name, status, type, extra_vars, host_count, created_by, created_at) "
        "VALUES (?, ?, ?, 'pending', 'manual', ?, ?, ?, ?)",
        (run_id, body.template_id, template_name, body.extra_vars, host_count, user["username"], database.now_iso()),
    )
    conn.commit()
    run = conn.execute("SELECT * FROM patch_runs WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"success": True, "run": _run_to_dict(run), "hostnames": hostnames}


@router.get("/runs/{run_id}")
def run_detail(run_id: int, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM patch_runs WHERE id = ?", (run_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"success": True, "run": _run_to_dict(row)}


@router.post("/trigger")
def trigger(body: TriggerRun, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    run_id = _new_run_id()
    template_name = None

    try:
        tpl = awx.get_job_template_data(body.template_id)
        template_name = tpl.get("name", f"template-{body.template_id}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach AWX: {e}")

    host_count = len(body.host_ids or [])
    hostnames = []
    if body.host_ids:
        placeholders = ",".join("?" * len(body.host_ids))
        hostnames = [r["hostname"] for r in
                     conn.execute(f"SELECT hostname FROM hosts WHERE id IN ({placeholders})", body.host_ids).fetchall()]

    extra_vars = {}
    if body.extra_vars:
        try:
            extra_vars = json.loads(body.extra_vars)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="extra_vars must be valid JSON")
    extra_vars["run_id"] = run_id
    if hostnames:
        extra_vars["host_group"] = hostnames

    # Write the host CSV the playbook consumes (compat with legacy awx_handler flow)
    csv_name = f"{run_id}_onepatch_execution.csv"
    csv_path = config.USER_FILES / csv_name
    with open(csv_path, "w") as f:
        f.write("host\n")
        for h in hostnames:
            f.write(f"{h}\n")

    result = awx.launch_job(body.template_id, json.dumps(extra_vars))
    if not result.get("success"):
        conn.close()
        raise HTTPException(status_code=502, detail=result.get("error", "AWX launch failed"))

    cur = conn.execute(
        "INSERT INTO patch_runs (run_id, template_id, template_name, status, type, extra_vars, host_count, created_by, created_at, started_at) "
        "VALUES (?, ?, ?, 'running', 'manual', ?, ?, ?, ?, ?)",
        (run_id, body.template_id, template_name, json.dumps(extra_vars), host_count, user["username"],
         database.now_iso(), database.now_iso()),
    )
    conn.commit()
    run = conn.execute("SELECT * FROM patch_runs WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"success": True, "run": _run_to_dict(run), "awx": result, "hostnames": hostnames}
