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


def _record_failed_run(conn, run_id, template_id, template_name, extra_vars, host_count, username, run_type="manual"):
    cur = conn.execute(
        "INSERT INTO patch_runs (run_id, template_id, template_name, status, type, extra_vars, host_count, created_by, created_at) "
        "VALUES (%s, %s, %s, 'failed', %s, %s, %s, %s, %s) RETURNING id",
        (run_id, template_id, template_name, run_type, extra_vars, host_count, username, database.now_iso()),
    )
    conn.commit()
    row_id = cur.fetchone()["id"]
    return _run_to_dict(conn.execute("SELECT * FROM patch_runs WHERE id = %s", (row_id,)).fetchone())


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


@router.get("/runs/{run_id}")
def run_detail(run_id: int, _user: dict = Depends(current_user)):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM patch_runs WHERE id = %s", (run_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"success": True, "run": _run_to_dict(row)}


@router.post("/runs")
def create_run(body: TriggerRun, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    run_id = _new_run_id()
    template_name = None

    if body.template_id:
        try:
            tpl = awx.get_job_template_data(body.template_id)
            template_name = tpl.get("name", f"template-{body.template_id}")
        except Exception:
            pass

    host_count = len(body.host_ids or [])
    cur = conn.execute(
        "INSERT INTO patch_runs (run_id, template_id, template_name, status, type, extra_vars, host_count, created_by, created_at) "
        "VALUES (%s, %s, %s, 'pending', 'manual', %s, %s, %s, %s) RETURNING id",
        (run_id, body.template_id, template_name, body.extra_vars, host_count, user["username"], database.now_iso()),
    )
    conn.commit()
    row_id = cur.fetchone()["id"]
    run = conn.execute("SELECT * FROM patch_runs WHERE id = %s", (row_id,)).fetchone()
    conn.close()
    return {"success": True, "run": _run_to_dict(run)}


def orchestrate_run(conn, template_id, host_ids, extra_vars, username, run_type="manual"):
    """Launch a real patch run against AWX and record it in the DB.

    Shared by the manual /trigger endpoint and the scheduler.

    Flow:
      1. generate run_id
      2. build the host CSV the playbook consumes
      3. create/refresh an AWX group in the master inventory holding the target hosts
      4. launch the job template scoped to that group, with run_id + vault info in extra_vars
      5. record the run (success or failure) in the DB
    """
    run_id = _new_run_id()

    template_name = None
    try:
        tpl = awx.get_job_template_data(template_id)
        template_name = tpl.get("name", f"template-{template_id}")
    except Exception as e:
        run = _record_failed_run(conn, run_id, template_id, template_name, json.dumps(extra_vars or {}), 0,
                                 username, run_type)
        return {"success": False, "run": _run_to_dict(run), "awx": {"error": str(e)},
                "error": f"Could not reach AWX: {e}"}

    hostnames = []
    if host_ids:
        placeholders = ",".join("%s" * len(host_ids))
        hostnames = [r["hostname"] for r in
                     conn.execute(f"SELECT hostname FROM hosts WHERE id IN ({placeholders})", host_ids).fetchall()]

    extra_vars = dict(extra_vars or {})
    extra_vars["run_id"] = run_id

    # CSV the playbook consumes (compat with legacy awx_handler flow)
    csv_name = f"{run_id}_onepatch_execution.csv"
    csv_path = config.USER_FILES / csv_name
    with open(csv_path, "w") as f:
        f.write("host\n")
        for h in hostnames:
            f.write(f"{h}\n")

    # Group in AWX inventory so playbooks can run `hosts: "{{ host_group }}"`
    group_name = f"gpta_{run_id}"
    try:
        group = awx.ensure_host_group(group_name, hostnames)
        extra_vars["host_group"] = group["name"]
        extra_vars["encryptedPasswordFile"] = "Vault/sudoUserEncryptfile.yml"
    except Exception as e:
        run = _record_failed_run(conn, run_id, template_id, template_name, json.dumps(extra_vars),
                                 len(hostnames), username, run_type)
        return {"success": False, "run": _run_to_dict(run), "awx": {"error": str(e)},
                "error": f"AWX group setup failed: {e}"}

    result = awx.launch_job(template_id, json.dumps(extra_vars), limit_hosts=hostnames or None)
    if not result.get("success"):
        # record the failed run so operators can see it
        run = _record_failed_run(conn, run_id, template_id, template_name, json.dumps(extra_vars),
                                 len(hostnames), username, run_type)
        return {"success": False, "run": _run_to_dict(run), "awx": result, "error": result.get("error")}

    cur = conn.execute(
        "INSERT INTO patch_runs (run_id, template_id, template_name, status, type, extra_vars, host_count, created_by, created_at, started_at) "
        "VALUES (%s, %s, %s, 'running', %s, %s, %s, %s, %s, %s) RETURNING id",
        (run_id, template_id, template_name, run_type, json.dumps(extra_vars), len(hostnames), username,
         database.now_iso(), database.now_iso()),
    )
    conn.commit()
    run_id_value = cur.fetchone()["id"]
    run = conn.execute("SELECT * FROM patch_runs WHERE id = %s", (run_id_value,)).fetchone()
    return {"success": True, "run": _run_to_dict(run), "awx": result, "hostnames": hostnames}


@router.post("/trigger")
def trigger(body: TriggerRun, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    try:
        extra_vars = json.loads(body.extra_vars) if body.extra_vars else {}
    except json.JSONDecodeError:
        conn.close()
        raise HTTPException(status_code=400, detail="extra_vars must be valid JSON")
    try:
        result = orchestrate_run(conn, body.template_id, body.host_ids, extra_vars, user["username"], "manual")
    finally:
        conn.close()
    return result


@router.post("/runs/{run_id}/refresh")
def refresh_run(run_id: int, _user: dict = Depends(current_user)):
    """Reconcile a run's status against AWX jobs and update the DB."""
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM patch_runs WHERE id = %s", (run_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Run not found")
    status = awx.refresh_run_status(row["run_id"])
    finished = None
    if status in ("successful", "failed", "canceled", "error"):
        finished = database.now_iso()
    conn.execute("UPDATE patch_runs SET status = %s, finished_at = COALESCE(%s, finished_at) WHERE id = %s",
                 (status, finished, run_id))
    conn.commit()
    row = conn.execute("SELECT * FROM patch_runs WHERE id = %s", (run_id,)).fetchone()
    conn.close()
    return {"success": True, "run": _run_to_dict(row)}
