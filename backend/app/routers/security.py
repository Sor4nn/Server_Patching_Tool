import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from .. import database
from .auth import current_user
from .dashboard import SYSTEM_STATUS

router = APIRouter(prefix="/api/v1/security", tags=["security"])

HOST_SELECT = """
    SELECT h.id, h.hostname, h.friendly_name, h.ip_address, h.os_make, h.os_version,
           h.latest_patch, h.last_seen, h.state, h.group_id, g.name AS group_name,
           (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id) AS package_count,
           (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1) AS outdated_count,
           (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1 AND hp.is_security_update = 1) AS security_count,
           (SELECT COUNT(*) FROM host_packages hp WHERE hp.host_id = h.id AND hp.cves IS NOT NULL AND hp.cves <> '') AS cve_count,
           (SELECT string_agg(DISTINCT hp.name, ', ') FROM host_packages hp
              WHERE hp.host_id = h.id AND hp.cves IS NOT NULL AND hp.cves <> '') AS cve_packages
    FROM hosts h
    LEFT JOIN host_groups g ON g.id = h.group_id
"""


def _host_status(row) -> str:
    if row["last_seen"] is None:
        return "not_reporting"
    return "needs_updates" if row["outdated_count"] else "up_to_date"


def _query_hosts(conn, status: Optional[str] = None, group_id: Optional[int] = None):
    where, params = [], []
    if status:
        where.append(SYSTEM_STATUS[status])
    if group_id:
        where.append("h.group_id = %s")
        params.append(group_id)
    sql = HOST_SELECT + (f" WHERE {' AND '.join(where)}" if where else "")
    return conn.execute(sql + " ORDER BY h.hostname", params).fetchall()


def _breakdown(conn, expr: str):
    return [dict(r) for r in conn.execute(f"""
        SELECT {expr} AS name, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE h.last_seen IS NOT NULL AND NOT EXISTS
                 (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS up_to_date,
               COUNT(*) FILTER (WHERE EXISTS
                 (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS needs_updates,
               COUNT(*) FILTER (WHERE h.last_seen IS NULL) AS not_reporting
        FROM hosts h
        LEFT JOIN host_groups g ON g.id = h.group_id
        GROUP BY 1 ORDER BY 1
    """).fetchall()]


def _host_rows(rows) -> list[dict]:
    hosts = []
    for r in rows:
        d = dict(r)
        d["status"] = _host_status(r)
        d["needs_reboot"] = bool(d["state"] and "reboot" in d["state"].lower())
        d.pop("state")
        hosts.append(d)
    return hosts


def _build_report(conn, status, group_id):
    rows = _query_hosts(conn, status, group_id)
    summary = _summary(conn)
    return {
        "success": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"status": status, "group_id": group_id},
        "summary": summary,
        "groups": _breakdown(conn, "COALESCE(g.name, 'Ungrouped')"),
        "os": _breakdown(conn, "COALESCE(h.os_make, 'Unknown')"),
        "hosts": _host_rows(rows),
    }


def _summary(conn) -> dict:
    counts = conn.execute("""
        SELECT COUNT(*) AS total_hosts,
               COUNT(*) FILTER (WHERE h.last_seen IS NOT NULL) AS reporting,
               COUNT(*) FILTER (WHERE h.last_seen IS NULL) AS not_reporting,
               COUNT(*) FILTER (WHERE h.last_seen IS NOT NULL AND NOT EXISTS
                 (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS up_to_date,
               COUNT(*) FILTER (WHERE EXISTS
                 (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.needs_update = 1)) AS needs_updates,
               COUNT(*) FILTER (WHERE LOWER(COALESCE(h.state, '')) LIKE '%reboot%') AS needs_reboot,
               COUNT(*) FILTER (WHERE EXISTS
                 (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id AND hp.cves IS NOT NULL AND hp.cves <> '')) AS hosts_with_cves
        FROM hosts h
    """).fetchone()
    pkg = conn.execute("""
        SELECT COUNT(*) AS package_installs,
               COUNT(*) FILTER (WHERE needs_update = 1) AS outdated_packages,
               COUNT(*) FILTER (WHERE needs_update = 1 AND is_security_update = 1) AS security_updates
        FROM host_packages
    """).fetchone()
    total = counts["total_hosts"]
    summary = {**counts, **pkg}
    summary["patch_coverage_pct"] = round(counts["up_to_date"] / total * 100, 1) if total else 0.0
    return summary


@router.get("/report")
def security_report(status: Optional[str] = None, group_id: Optional[int] = None,
                    _user: dict = Depends(current_user)):
    if status is not None and status not in SYSTEM_STATUS:
        raise HTTPException(status_code=400,
                            detail=f"status must be one of {', '.join(SYSTEM_STATUS)}")
    conn = database.get_connection()
    try:
        report = _build_report(conn, status, group_id)
    finally:
        conn.close()
    return report


@router.get("/report.csv")
def security_report_csv(status: Optional[str] = None, group_id: Optional[int] = None,
                        _user: dict = Depends(current_user)):
    """Per-host patch posture as a downloadable CSV."""
    if status is not None and status not in SYSTEM_STATUS:
        raise HTTPException(status_code=400,
                            detail=f"status must be one of {', '.join(SYSTEM_STATUS)}")
    conn = database.get_connection()
    try:
        rows = _host_rows(_query_hosts(conn, status, group_id))
    finally:
        conn.close()

    columns = ["hostname", "friendly_name", "ip_address", "group_name", "os_make", "os_version",
               "status", "outdated_count", "security_count", "cve_count", "package_count",
               "needs_reboot", "latest_patch", "last_seen"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    filename = f"security-report-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
