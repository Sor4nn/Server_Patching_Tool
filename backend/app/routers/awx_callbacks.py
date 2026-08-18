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


class PackageInfo(BaseModel):
    name: str
    version: Optional[str] = None
    release: Optional[str] = None
    arch: Optional[str] = None
    epoch: Optional[str] = None
    source: Optional[str] = None
    installed_at: Optional[str] = None
    available_version: Optional[str] = None
    needs_update: Optional[bool] = None
    is_security_update: Optional[bool] = None
    category: Optional[str] = None
    cves: Optional[str] = None


class UpdatePackages(BaseModel):
    hostname: str
    packages: list[PackageInfo]


class ServiceStatus(BaseModel):
    service_name: str
    load_state: Optional[str] = None
    active_state: Optional[str] = None
    sub_state: Optional[str] = None
    restart_rc: Optional[int] = None


class FilesystemUsage(BaseModel):
    mount: str
    device: Optional[str] = None
    fs_type: Optional[str] = None
    size_kb: Optional[int] = None
    used_kb: Optional[int] = None
    avail_kb: Optional[int] = None
    use_pct: Optional[int] = None


class UpdateServices(BaseModel):
    hostname: str
    services: list[ServiceStatus] = []
    filesystems: list[FilesystemUsage] = []
    critical_names: list[str] = []


@router.post("/generate_runid")
def generate_runid(body: GenerateRunId):
    now = datetime.now(timezone.utc)
    run_id = f'{now.year}{now.month:02}{now.day:02}_{now.hour:02}{now.minute:02}{now.second:02}'
    conn = database.get_connection()
    conn.execute("INSERT INTO patch_runs (run_id, status, type, created_at) VALUES (%s, 'pending', 'callback', %s)",
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
    cur = conn.execute("UPDATE patch_runs SET status = %s WHERE run_id = %s", (body.status, run_id))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updatelatestpatch")
def update_latest_patch(body: LatestPatch):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET latest_patch = %s, uptime = %s, updated_at = %s, last_seen = %s "
                       "WHERE hostname = %s",
                       (body.latestpatch.upper(), body.uptime, database.now_iso(), database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/patch_task")
def create_patch_task(body: PatchTask):
    conn = database.get_connection()
    existing = conn.execute("SELECT id FROM hosts WHERE hostname = %s", (body.hostname,)).fetchone()
    now = database.now_iso()
    if existing:
        conn.execute(
            "UPDATE hosts SET ip_address = %s, state = COALESCE(%s, state), action = COALESCE(%s, action), "
            "remarks = COALESCE(%s, remarks), updated_at = %s, last_seen = %s WHERE id = %s",
            (body.ipaddress, body.state, body.action, body.remarks, now, now, existing["id"]),
        )
        row = conn.execute("SELECT * FROM hosts WHERE id = %s", (existing["id"],)).fetchone()
        host_id = existing["id"]
    else:
        cur = conn.execute(
            "INSERT INTO hosts (hostname, ip_address, state, action, remarks, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.hostname, body.ipaddress, body.state, body.action, body.remarks, now, now),
        )
        host_id = cur.fetchone()["id"]
        row = conn.execute("SELECT * FROM hosts WHERE id = %s", (host_id,)).fetchone()
    conn.commit()
    conn.close()
    return {"id": host_id, "runid": body.runid, "hostname": body.hostname, "state": row["state"],
            "action": row["action"], "remarks": row["remarks"], "created_at": now}


@router.post("/updateaction")
def update_action(body: UpdateAction):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET action = %s, updated_at = %s, last_seen = %s WHERE hostname = %s",
                       (body.action, database.now_iso(), database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updateremarks")
def update_remarks(body: UpdateRemarks):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET remarks = %s, updated_at = %s, last_seen = %s WHERE hostname = %s",
                       (body.remarks, database.now_iso(), database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updateonboard")
def update_onboard(body: UpdateOnBoard):
    conn = database.get_connection()
    cur = conn.execute("UPDATE hosts SET state = %s, updated_at = %s, last_seen = %s WHERE hostname = %s",
                       (body.state, database.now_iso(), database.now_iso(), body.hostname))
    conn.commit()
    rows = cur.rowcount
    conn.close()
    return f"Updated {rows} Rows"


@router.post("/updatepackages")
def update_packages(body: UpdatePackages):
    conn = database.get_connection()
    host = conn.execute("SELECT id FROM hosts WHERE hostname = %s", (body.hostname,)).fetchone()
    if not host:
        conn.close()
        return f"Host {body.hostname} not found"
    host_id = host["id"]
    now = database.now_iso()

    # A report that carries update info (check_updates.yml) refreshes the update
    # status; an inventory-only report (collect_packages.yml) must NOT wipe the
    # pending-update flags computed by a previous check.
    reported = set()
    for pkg in body.packages:
        reported.add((pkg.name, pkg.version, pkg.release, pkg.arch))
        installed_at = database.normalize_installed_at(pkg.installed_at)
        has_update_info = any(v is not None for v in
                              (pkg.available_version, pkg.needs_update, pkg.is_security_update, pkg.cves))
        if has_update_info:
            conn.execute(
                "INSERT INTO host_packages (host_id, name, version, release, arch, epoch, source, installed_at, created_at, "
                "available_version, needs_update, is_security_update, category, cves) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (host_id, name, version, release, arch) DO UPDATE SET "
                "epoch = EXCLUDED.epoch, source = EXCLUDED.source, installed_at = EXCLUDED.installed_at, "
                "available_version = EXCLUDED.available_version, needs_update = EXCLUDED.needs_update, "
                "is_security_update = EXCLUDED.is_security_update, category = EXCLUDED.category, cves = EXCLUDED.cves",
                (host_id, pkg.name, pkg.version, pkg.release, pkg.arch, pkg.epoch, pkg.source, installed_at, now,
                 pkg.available_version, int(pkg.needs_update or 0), int(pkg.is_security_update or 0), pkg.category,
                 pkg.cves),
            )
        else:
            conn.execute(
                "INSERT INTO host_packages (host_id, name, version, release, arch, epoch, source, installed_at, created_at, "
                "available_version, needs_update, is_security_update, category, cves) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, 0, 0, %s, NULL) "
                "ON CONFLICT (host_id, name, version, release, arch) DO UPDATE SET "
                "epoch = EXCLUDED.epoch, source = EXCLUDED.source, installed_at = EXCLUDED.installed_at, "
                "category = COALESCE(EXCLUDED.category, host_packages.category)",
                (host_id, pkg.name, pkg.version, pkg.release, pkg.arch, pkg.epoch, pkg.source, installed_at, now,
                 pkg.category),
            )

    # Drop rows for packages no longer installed on the host.
    rows = conn.execute(
        "SELECT name, version, release, arch FROM host_packages WHERE host_id = %s", (host_id,)).fetchall()
    for r in rows:
        key = (r["name"], r["version"], r["release"], r["arch"])
        if key not in reported:
            conn.execute(
                "DELETE FROM host_packages WHERE host_id = %s AND name = %s AND version = %s AND release = %s AND arch = %s",
                (host_id, r["name"], r["version"], r["release"], r["arch"]),
            )

    conn.execute("UPDATE hosts SET updated_at = %s, last_seen = %s WHERE id = %s", (now, now, host_id))
    database.capture_package_snapshot(conn, host_id)
    conn.commit()
    conn.close()
    return f"Updated {len(body.packages)} packages for {body.hostname}"


@router.post("/updateservices")
def update_services(body: UpdateServices):
    conn = database.get_connection()
    host = conn.execute("SELECT id FROM hosts WHERE hostname = %s", (body.hostname,)).fetchone()
    if not host:
        conn.close()
        return f"Host {body.hostname} not found"
    host_id = host["id"]
    now = database.now_iso()
    critical_set = {n for n in body.critical_names if n}

    if body.services:
        conn.execute("DELETE FROM host_services WHERE host_id = %s", (host_id,))
        for svc in body.services:
            conn.execute(
                "INSERT INTO host_services (host_id, service_name, load_state, active_state, sub_state, is_critical, last_checked) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (host_id, service_name) DO UPDATE SET "
                "load_state = EXCLUDED.load_state, active_state = EXCLUDED.active_state, "
                "sub_state = EXCLUDED.sub_state, is_critical = EXCLUDED.is_critical, last_checked = EXCLUDED.last_checked",
                (host_id, svc.service_name, svc.load_state, svc.active_state, svc.sub_state,
                 int(svc.service_name in critical_set), now),
            )

    if body.filesystems:
        conn.execute("DELETE FROM host_filesystems WHERE host_id = %s", (host_id,))
        for fs in body.filesystems:
            conn.execute(
                "INSERT INTO host_filesystems (host_id, mount, device, fs_type, size_kb, used_kb, avail_kb, use_pct, last_checked) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (host_id, mount) DO UPDATE SET "
                "device = EXCLUDED.device, fs_type = EXCLUDED.fs_type, size_kb = EXCLUDED.size_kb, "
                "used_kb = EXCLUDED.used_kb, avail_kb = EXCLUDED.avail_kb, use_pct = EXCLUDED.use_pct, "
                "last_checked = EXCLUDED.last_checked",
                (host_id, fs.mount, fs.device, fs.fs_type, fs.size_kb, fs.used_kb, fs.avail_kb, fs.use_pct, now),
            )

    conn.execute("UPDATE hosts SET updated_at = %s, last_seen = %s WHERE id = %s", (now, now, host_id))
    conn.commit()
    conn.close()
    return {"services": len(body.services), "filesystems": len(body.filesystems), "host": body.hostname}
