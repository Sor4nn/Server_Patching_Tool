"""Backward-compatible AWX callback paths.

Existing AWX playbooks and webhook notifications hit these root paths. They
map onto the new schema: patchservers_upload_runid -> patch_runs,
patchservers_serverpatchdetails -> hosts.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from .. import database

router = APIRouter(tags=["awx-callbacks"])


class GenerateRunId(BaseModel):
    uploadid: str


class Notification(BaseModel):
    status: str
    extra_vars: str


class LatestPatch(BaseModel):
    hostname: str
    latestpatch: Optional[str] = ""
    uptime: Optional[str] = ""


class PatchTask(BaseModel):
    runid: str
    hostname: str
    ipaddress: Optional[str] = None
    state: Optional[str] = None
    action: Optional[str] = None
    remarks: Optional[str] = None
    defaultuser: Optional[str] = None
    defaultpass: Optional[str] = None


class UpdateAction(BaseModel):
    runid: str
    hostname: str
    action: str


class UpdateRemarks(BaseModel):
    runid: str
    hostname: str
    remarks: str


class UpdateOnBoard(BaseModel):
    runid: str
    hostname: str
    state: str


@router.post("/generate_runid")
def generate_runid(body: GenerateRunId):
    now = datetime.now(timezone.utc)
    run_id = f'{now.year}{now.month:02}{now.day:02}_{now.hour:02}{now.minute:02}{now.second:02}'
    conn = database.get_connection()
    conn.execute("INSERT INTO patch_runs (run_id, status, type, created_at) VALUES (?, 'pending', 'callback', ?)",
                 (run_id, database.now_iso()))
    conn.commit()
    conn.close()
    return {"run_id": run_id}


@router.post("/update_runid")
def update_runid(body: Notification):
    try:
        extra_vars = json.loads(body.extra_vars)
    except json.JSONDecodeError:
        extra_vars = {}
    run_id = extra_vars.get("run_id", "")
    if not run_id:
        return "run_id not found in extra_vars"
    conn = database.get_connection()
    cur = conn.execute("UPDATE patch_runs SET status = ? WHERE run_id = ?", (body.status, run_id))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updatelatestpatch")
def update_latest_patch(body: LatestPatch):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET latest_patch = ?, uptime = ?, updated_at = ? WHERE hostname = ?",
                       (body.latestpatch.upper(), body.uptime, database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/patch_task")
def create_patch_task(body: PatchTask):
    conn = database.get_connection()
    existing = conn.execute("SELECT id FROM hosts WHERE hostname = ?", (body.hostname,)).fetchone()
    now = database.now_iso()
    if existing:
        conn.execute(
            "UPDATE hosts SET ip_address = ?, state = COALESCE(?, state), action = COALESCE(?, action), "
            "remarks = COALESCE(?, remarks), updated_at = ? WHERE id = ?",
            (body.ipaddress, body.state, body.action, body.remarks, now, existing["id"]),
        )
        row = conn.execute("SELECT * FROM hosts WHERE id = ?", (existing["id"],)).fetchone()
        host_id = existing["id"]
    else:
        cur = conn.execute(
            "INSERT INTO hosts (hostname, ip_address, state, action, remarks, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (body.hostname, body.ipaddress, body.state, body.action, body.remarks, now, now),
        )
        host_id = cur.lastrowid
        row = conn.execute("SELECT * FROM hosts WHERE id = ?", (host_id,)).fetchone()
    conn.commit()
    conn.close()
    return {"id": host_id, "runid": body.runid, "hostname": body.hostname, "state": row["state"],
            "action": row["action"], "remarks": row["remarks"], "created_at": now}


@router.post("/updateaction")
def update_action(body: UpdateAction):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET action = ?, updated_at = ? WHERE hostname = ?", (body.action, database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updateremarks")
def update_remarks(body: UpdateRemarks):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET remarks = ?, updated_at = ? WHERE hostname = ?", (body.remarks, database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updateonboard")
def update_onboard(body: UpdateOnBoard):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET state = ?, updated_at = ? WHERE hostname = ?", (body.state, database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"
