from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import database
from .auth import current_user

router = APIRouter(prefix="/api/v1/packages", tags=["packages"])


@router.get("")
def list_packages(category: Optional[str] = None, search: Optional[str] = None,
                  status: Optional[str] = None, host_id: Optional[int] = None,
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
        query += " AND p.category = %s"
        params.append(category)
    if search:
        query += " AND p.name LIKE %s"
        params.append(f"%{search}%")
    if host_id:
        query += " AND p.host_id = %s"
        params.append(host_id)
    if status == "outdated":
        query += " AND p.needs_update = 1"
    elif status == "security":
        query += " AND p.needs_update = 1 AND p.is_security_update = 1"
    elif status == "uptodate":
        query += " AND p.needs_update = 0"
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
            "cves": r["cves"] or "",
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


def _snapshot_group_query(conn, snapshot_id: int):
    """Resolve a package-row id to its snapshot group (host_id, captured_at)."""
    row = conn.execute(
        "SELECT host_id, captured_at, MAX(kind) AS kind FROM package_snapshots WHERE id = %s "
        "GROUP BY host_id, captured_at", (snapshot_id,)).fetchone()
    return row


@router.get("/history")
def snapshot_list(host_id: Optional[int] = None, limit: int = 100, _user: dict = Depends(current_user)):
    """Versioned package history: one entry per material change, per host (git-style).

    A snapshot is the set of package rows captured together at a given moment,
    identified by (host_id, captured_at).
    """
    conn = database.get_connection()
    params: list = []
    where = ""
    if host_id:
        where = "WHERE s.host_id = %s"
        params.append(host_id)
    rows = conn.execute(
        f"SELECT MIN(s.id) AS snapshot_id, s.host_id, h.hostname, h.friendly_name, s.captured_at, "
        f"MAX(s.kind) AS kind, COUNT(*) AS package_count "
        f"FROM package_snapshots s JOIN hosts h ON h.id = s.host_id {where} "
        f"GROUP BY s.host_id, s.captured_at, h.hostname, h.friendly_name "
        f"ORDER BY s.captured_at DESC, MIN(s.id) DESC LIMIT %s",
        params + [limit]).fetchall()
    for r in rows:
        prev_row = conn.execute(
            "SELECT captured_at FROM package_snapshots ps "
            "WHERE ps.host_id = %s AND ps.captured_at < %s "
            "ORDER BY ps.captured_at DESC, ps.id DESC LIMIT 1", (r["host_id"], r["captured_at"])).fetchone()
        if not prev_row:
            r["changes"] = r["package_count"]
            continue
        from_keys = {(x["name"], x["version"], x["release"], x["arch"]) for x in
                     conn.execute("SELECT name, version, release, arch FROM package_snapshots "
                                  "WHERE host_id = %s AND captured_at = %s", (r["host_id"], r["captured_at"])).fetchall()}
        prev_keys = {(x["name"], x["version"], x["release"], x["arch"]) for x in
                     conn.execute("SELECT name, version, release, arch FROM package_snapshots "
                                  "WHERE host_id = %s AND captured_at = %s",
                                  (r["host_id"], prev_row["captured_at"])).fetchall()}
        r["changes"] = len(from_keys.symmetric_difference(prev_keys))
    conn.close()
    return {"success": True, "snapshots": rows}


@router.get("/diff")
def snapshot_diff(from_id: int, to_id: int, _user: dict = Depends(current_user)):
    """Compare two snapshots of the same host like a git diff.

    Supports forward and backward diffs between any two snapshot ids
    (either direction: from->to is interpreted as written).
    """
    conn = database.get_connection()
    a = _snapshot_group_query(conn, from_id)
    b = _snapshot_group_query(conn, to_id)
    if not a or not b:
        conn.close()
        raise HTTPException(status_code=404, detail="snapshot not found")
    if a["host_id"] != b["host_id"]:
        conn.close()
        raise HTTPException(status_code=400, detail="snapshots must belong to the same host")
    if a["captured_at"] == b["captured_at"]:
        conn.close()
        raise HTTPException(status_code=400, detail="snapshots are identical")

    from_rows = conn.execute("SELECT name, version, release, arch, epoch, available_version, needs_update, is_security_update, cves "
                             "FROM package_snapshots WHERE host_id = %s AND captured_at = %s ORDER BY name",
                             (a["host_id"], a["captured_at"])).fetchall()
    to_rows = conn.execute("SELECT name, version, release, arch, epoch, available_version, needs_update, is_security_update, cves "
                           "FROM package_snapshots WHERE host_id = %s AND captured_at = %s ORDER BY name",
                           (b["host_id"], b["captured_at"])).fetchall()

    by_name_from = {r["name"]: dict(r) for r in from_rows}
    by_name_to = {r["name"]: dict(r) for r in to_rows}

    def ver(x):
        return f'{x["epoch"] + ":" if x.get("epoch") else ""}{x["version"]}-{x["release"] or ""}'.rstrip("-")

    changed = []
    for name in sorted(set(by_name_from) & set(by_name_to)):
        f, t = by_name_from[name], by_name_to[name]
        if ver(f) != ver(t) or int(f["needs_update"] or 0) != int(t["needs_update"] or 0) \
                or int(f["is_security_update"] or 0) != int(t["is_security_update"] or 0):
            changed.append({
                "name": name,
                "from": ver(f),
                "to": ver(t),
                "from_needs_update": bool(f["needs_update"]),
                "to_needs_update": bool(t["needs_update"]),
                "from_security": bool(f["is_security_update"]),
                "to_security": bool(t["is_security_update"]),
                "cves": t["cves"] or "",
            })

    added = [{
        "name": r["name"],
        "version": ver(r),
        "needs_update": bool(r["needs_update"]),
        "is_security_update": bool(r["is_security_update"]),
        "cves": r["cves"] or "",
    } for r in to_rows if r["name"] not in by_name_from]
    removed = [{
        "name": r["name"],
        "version": ver(r),
        "needs_update": bool(r["needs_update"]),
        "is_security_update": bool(r["is_security_update"]),
        "cves": r["cves"] or "",
    } for r in from_rows if r["name"] not in by_name_to]

    conn.close()
    return {
        "success": True,
        "from": {"id": from_id, "captured_at": a["captured_at"], "kind": a["kind"]},
        "to": {"id": to_id, "captured_at": b["captured_at"], "kind": b["kind"]},
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "security_to": sum(1 for r in to_rows if r["needs_update"] and r["is_security_update"]),
        },
        "added": added,
        "removed": removed,
        "changed": changed,
    }
