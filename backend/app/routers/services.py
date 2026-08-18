from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user, require_admin
from .patching import orchestrate_run

router = APIRouter(prefix="/api/v1/services", tags=["services"])


class CatalogCreate(BaseModel):
    name: str
    description: Optional[str] = None


class RefreshRequest(BaseModel):
    host_ids: Optional[list[int]] = None


class RestartRequest(BaseModel):
    host_ids: list[int]
    service: str


def _host_summary(conn, host_id: int) -> dict:
    svc = conn.execute(
        "SELECT COUNT(*) AS total,"
        " COUNT(*) FILTER (WHERE active_state = 'active') AS active,"
        " COUNT(*) FILTER (WHERE active_state = 'failed') AS failed,"
        " COUNT(*) FILTER (WHERE is_critical = 1) AS critical,"
        " COUNT(*) FILTER (WHERE is_critical = 1 AND active_state != 'active') AS critical_failed"
        " FROM host_services WHERE host_id = %s", (host_id,)).fetchone()
    fs = conn.execute(
        "SELECT COUNT(*) AS total,"
        " COALESCE(MAX(use_pct), 0) AS max_use,"
        " COUNT(*) FILTER (WHERE use_pct >= 90) AS over_threshold"
        " FROM host_filesystems WHERE host_id = %s", (host_id,)).fetchone()
    last = conn.execute("SELECT last_checked FROM host_services WHERE host_id = %s ORDER BY last_checked DESC LIMIT 1",
                        (host_id,)).fetchone()
    return {
        "services_total": svc["total"],
        "services_active": svc["active"],
        "services_failed": svc["failed"],
        "critical_total": svc["critical"],
        "critical_failed": svc["critical_failed"],
        "fs_total": fs["total"],
        "fs_max_use": fs["max_use"],
        "fs_over_threshold": fs["over_threshold"],
        "last_checked": last["last_checked"] if last else None,
    }


@router.get("")
def list_services(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    hosts = conn.execute(
        "SELECT h.id, h.hostname, h.ip_address, h.friendly_name, h.os_make, h.os_version, "
        "h.state, h.group_id, g.name AS group_name, h.last_seen "
        "FROM hosts h LEFT JOIN host_groups g ON g.id = h.group_id ORDER BY h.hostname"
    ).fetchall()
    catalog = [r["name"] for r in conn.execute("SELECT name FROM critical_services ORDER BY name").fetchall()]
    critical_set = set(catalog)

    out = []
    for h in hosts:
        d = dict(h)
        services = [dict(r) for r in conn.execute(
            "SELECT service_name, load_state, active_state, sub_state, is_critical, last_checked "
            "FROM host_services WHERE host_id = %s ORDER BY is_critical DESC, service_name", (h["id"],)).fetchall()]
        for s in services:
            s["is_critical"] = bool(s["is_critical"])
            s["healthy"] = s["active_state"] == "active"
        filesystems = [dict(r) for r in conn.execute(
            "SELECT mount, device, fs_type, size_kb, used_kb, avail_kb, use_pct, last_checked "
            "FROM host_filesystems WHERE host_id = %s ORDER BY mount", (h["id"],)).fetchall()]
        d["services"] = services
        d["filesystems"] = filesystems
        d["summary"] = _host_summary(conn, h["id"])
        out.append(d)

    totals = {
        "hosts": len(out),
        "services": sum(len(h["services"]) for h in out),
        "failed": sum(1 for h in out for s in h["services"] if not s["healthy"]),
        "critical": sum(1 for h in out for s in h["services"] if s["is_critical"]),
        "critical_failed": sum(1 for h in out for s in h["services"] if s["is_critical"] and not s["healthy"]),
        "fs_over_threshold": sum(h["summary"]["fs_over_threshold"] for h in out),
    }
    conn.close()
    return {"success": True, "hosts": out, "catalog": catalog, "totals": totals}


@router.get("/catalog")
def get_catalog(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM critical_services ORDER BY name").fetchall()
    conn.close()
    return {"success": True, "services": [dict(r) for r in rows]}


@router.post("/catalog")
def add_catalog(body: CatalogCreate, _user: dict = Depends(require_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    conn = database.get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO critical_services (name, description, created_at) VALUES (%s, %s, %s) RETURNING id",
            (name, body.description, database.now_iso()),
        )
        conn.commit()
    except database.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Service already in catalog")
    row = conn.execute("SELECT * FROM critical_services WHERE id = %s", (cur.fetchone()["id"],)).fetchone()
    conn.close()
    return {"success": True, "service": dict(row)}


@router.delete("/catalog/{service_id}")
def del_catalog(service_id: int, _user: dict = Depends(require_admin)):
    conn = database.get_connection()
    cur = conn.execute("DELETE FROM critical_services WHERE id = %s", (service_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Catalog entry not found")
    return {"success": True}


@router.post("/refresh")
def refresh_services(body: RefreshRequest, user: dict = Depends(require_admin)):
    conn = database.get_connection()
    if not body.host_ids:
        rows = conn.execute("SELECT id FROM hosts ORDER BY id").fetchall()
        body.host_ids = [r["id"] for r in rows]
    if not body.host_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="No hosts to refresh")
    catalog = [r["name"] for r in conn.execute("SELECT name FROM critical_services ORDER BY name").fetchall()]
    extra_vars = {"playbook": "check_services.yml", "critical_services": catalog}
    try:
        result = orchestrate_run(conn, None, body.host_ids, extra_vars, user["username"], "check_services")
    finally:
        conn.close()
    return result


@router.post("/restart")
def restart_service(body: RestartRequest, user: dict = Depends(require_admin)):
    if not body.host_ids or not body.service.strip():
        raise HTTPException(status_code=400, detail="host_ids and service are required")
    conn = database.get_connection()
    extra_vars = {"playbook": "restart_service.yml", "target_service": body.service.strip()}
    try:
        result = orchestrate_run(conn, None, body.host_ids, extra_vars, user["username"], "restart_service")
    finally:
        conn.close()
    return result
