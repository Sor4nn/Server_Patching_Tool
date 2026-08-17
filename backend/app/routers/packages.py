from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import database
from .auth import current_user

router = APIRouter(prefix="/api/v1/packages", tags=["packages"])


@router.get("")
def list_packages(category: Optional[str] = None, search: Optional[str] = None,
                  _user: dict = Depends(current_user)):
    """Aggregate installed packages across all hosts, mirroring PatchMon's /packages.

    Each package includes the list of hosts that have it installed, per-host
    current/available version, update flags, and aggregate stats.
    """
    conn = database.get_connection()
    query = """
        SELECT p.*, h.hostname, h.friendly_name, h.os_make, h.os_version, h.id AS hid
        FROM host_packages p JOIN hosts h ON h.id = p.host_id
        WHERE 1=1
    """
    params = []
    if category:
        query += " AND p.category = ?"
        params.append(category)
    if search:
        query += " AND p.name LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY p.name, h.hostname"
    rows = conn.execute(query, params).fetchall()

    agg: dict[str, dict] = {}
    for r in rows:
        pkg = agg.setdefault(r["name"], {
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "latest_version": r["available_version"],
            "packageHostsCount": 0,
            "packageHosts": [],
            "stats": {"totalInstalls": 0, "updatesNeeded": 0, "securityUpdates": 0},
            "sourceRepos": [],
        })
        host_entry = {
            "hostId": r["hid"],
            "friendlyName": r["friendly_name"] or r["hostname"],
            "osType": r["os_make"],
            "currentVersion": f'{r["epoch"] + ":" if r["epoch"] else ""}{r["version"]}-{r["release"] or ""}'.rstrip("-"),
            "availableVersion": r["available_version"],
            "needsUpdate": bool(r["needs_update"]),
            "isSecurityUpdate": bool(r["is_security_update"]),
        }
        pkg["packageHosts"].append(host_entry)
        pkg["packageHostsCount"] += 1
        pkg["stats"]["totalInstalls"] += 1
        if r["needs_update"]:
            pkg["stats"]["updatesNeeded"] += 1
        if r["is_security_update"]:
            pkg["stats"]["securityUpdates"] += 1

    categories = [dict(r) for r in
                  conn.execute("SELECT DISTINCT category AS name, category FROM host_packages WHERE category IS NOT NULL ORDER BY category").fetchall()]
    total = conn.execute("SELECT COUNT(*) AS c FROM host_packages").fetchone()["c"]
    conn.close()
    return {"success": True, "packages": list(agg.values()), "total": total, "categories": categories}


@router.get("/categories")
def list_categories(_user: dict = Depends(current_user)):
    conn = database.get_connection()
    rows = [r["category"] for r in
            conn.execute("SELECT DISTINCT category FROM host_packages WHERE category IS NOT NULL ORDER BY category").fetchall()]
    conn.close()
    return {"success": True, "categories": rows}
