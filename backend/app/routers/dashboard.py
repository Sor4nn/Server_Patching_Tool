from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .. import database
from .auth import current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# Per-host patch status:
#   up_to_date    - reported at least once, no packages waiting on updates
#   needs_updates - at least one package has needs_update = 1
#   not_reporting - never reported (last_seen is NULL)
SYSTEM_STATUS = {
    "up_to_date": "h.last_seen IS NOT NULL AND NOT EXISTS "
                  "(SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)",
    "needs_updates": "EXISTS (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)",
    "not_reporting": "h.last_seen IS NULL",
}

SYSTEM_SELECT = """
    SELECT h.id, h.hostname, h.ip_address, h.os_make, h.os_version, h.latest_patch,
           h.state, h.friendly_name, h.group_id, h.updated_at, h.last_seen,
           g.name AS group_name,
           (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1) AS outdated_count
    FROM hosts h
    LEFT JOIN host_groups g ON g.id = h.group_id
"""


def _resolve_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    if status not in SYSTEM_STATUS:
        raise HTTPException(status_code=400,
                            detail=f"status must be one of {', '.join(SYSTEM_STATUS)}")
    return status


@router.get("/stats")
def stats(limit: int = 10, offset: int = 0, status: Optional[str] = None,
          _user: dict = Depends(current_user)):
    status = _resolve_status(status)
    conn = database.get_connection()
    total_hosts = conn.execute("SELECT COUNT(*) AS c FROM hosts").fetchone()["c"]
    total_groups = conn.execute("SELECT COUNT(*) AS c FROM host_groups").fetchone()["c"]
    total_users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    total_runs = conn.execute("SELECT COUNT(*) AS c FROM patch_runs").fetchone()["c"]
    recent_runs = conn.execute("SELECT * FROM patch_runs ORDER BY id DESC LIMIT 5").fetchall()

    counts = conn.execute(
        "SELECT COUNT(*) AS total,"
        " COUNT(*) FILTER (WHERE last_seen IS NULL) AS not_reporting,"
        " COUNT(*) FILTER (WHERE NOT EXISTS "
        "   (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS up_to_date,"
        " COUNT(*) FILTER (WHERE EXISTS "
        "   (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS needs_updates"
        " FROM hosts h"
    ).fetchone()
    pkg = conn.execute(
        "SELECT COUNT(*) FILTER (WHERE needs_update = 1) AS outdated,"
        " COUNT(*) FILTER (WHERE needs_update = 1 AND is_security_update = 1) AS security"
        " FROM host_packages"
    ).fetchone()
    reboot = conn.execute(
        "SELECT COUNT(*) AS c FROM hosts WHERE LOWER(COALESCE(state, '')) LIKE '%reboot%'").fetchone()["c"]

    where = f" WHERE {SYSTEM_STATUS[status]}" if status else ""
    total_systems = conn.execute(f"SELECT COUNT(*) AS c FROM hosts h{where}").fetchone()["c"]
    systems = conn.execute(f"{SYSTEM_SELECT}{where} ORDER BY h.updated_at DESC LIMIT %s OFFSET %s",
                           (limit, offset)).fetchall()
    conn.close()

    system_rows = []
    for s in systems:
        d = dict(s)
        d["status"] = "not_reporting" if d["last_seen"] is None else \
            ("needs_updates" if d["outdated_count"] > 0 else "up_to_date")
        system_rows.append(d)

    return {
        "success": True,
        "stats": {
            "total_hosts": total_hosts,
            "total_groups": total_groups,
            "total_users": total_users,
            "total_runs": total_runs,
            "up_to_date": counts["up_to_date"],
            "needs_updates": counts["needs_updates"],
            "not_reporting": counts["not_reporting"],
            "outdated_packages": pkg["outdated"],
            "security_updates": pkg["security"],
            "needs_reboot": reboot,
        },
        "recent_runs": [dict(r) for r in recent_runs],
        "systems": system_rows,
        "total_systems": total_systems,
        "limit": limit,
        "offset": offset,
        "status": status,
    }