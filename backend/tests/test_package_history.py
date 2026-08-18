"""Integration tests for package history snapshots and git-style diffs
(requires gpta_test Postgres)."""
import uuid

import pytest

pytestmark = pytest.mark.integration


def _make_host(client):
    return client.post("/api/v1/hosts", json={
        "hostname": f"hist-{uuid.uuid4().hex[:8]}",
        "ip_address": "192.0.2.20",
        "os_make": "Red Hat Enterprise Linux",
        "os_version": "9.8",
    }).json()["host"]


def _set_packages(host_id, packages):
    """Replace the host's installed package set (name, version, needs_update)."""
    from app import database
    conn = database.get_connection()
    conn.execute("DELETE FROM host_packages WHERE host_id = %s", (host_id,))
    now = database.now_iso()
    for name, version, needs_update in packages:
        conn.execute(
            "INSERT INTO host_packages (host_id, name, version, release, arch, created_at, "
            "available_version, needs_update, is_security_update, cves) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (host_id, name, version, "1", "x86_64", now,
             "9.0" if needs_update else None, int(needs_update),
             int(needs_update), "CVE-2026-0002" if needs_update else None),
        )
    conn.commit()
    conn.close()


def _snapshot(host_id):
    from app import database
    conn = database.get_connection()
    try:
        return database.capture_package_snapshot(conn, host_id)
    finally:
        conn.commit()
        conn.close()


def _snap_ids(client, host_id):
    snaps = client.get("/api/v1/packages/history", params={"host_id": host_id}).json()["snapshots"]
    return snaps


def test_history_baseline_then_report(client, login):
    host = _make_host(client)
    _set_packages(host["id"], [("curl", "7.0", 0)])
    assert _snapshot(host["id"]) is True
    assert _snapshot(host["id"]) is False  # unchanged -> no new snapshot

    _set_packages(host["id"], [("curl", "7.2", 1)])  # upgrade available
    assert _snapshot(host["id"]) is True

    snaps = _snap_ids(client, host["id"])
    assert len(snaps) == 2
    assert snaps[0]["kind"] == "report"
    assert snaps[1]["kind"] == "baseline"
    assert snaps[0]["package_count"] == 1


def test_diff_shows_upgrade(client, login):
    host = _make_host(client)
    _set_packages(host["id"], [("curl", "7.0", 1)])   # old version, update pending
    assert _snapshot(host["id"]) is True
    _set_packages(host["id"], [("curl", "7.2", 0)])   # upgrade applied
    assert _snapshot(host["id"]) is True

    snaps = _snap_ids(client, host["id"])
    old, new = snaps[1]["snapshot_id"], snaps[0]["snapshot_id"]
    diff = client.get("/api/v1/packages/diff", params={"from_id": old, "to_id": new}).json()
    assert diff["success"] is True
    assert diff["summary"]["added"] == 0
    assert diff["summary"]["removed"] == 0
    assert diff["summary"]["changed"] == 1
    chg = diff["changed"][0]
    assert chg["name"] == "curl"
    assert chg["from"].startswith("7.0")
    assert chg["to"].startswith("7.2")
    assert chg["from_security"] is True
    assert chg["to_security"] is False


def test_diff_shows_add_and_remove(client, login):
    host = _make_host(client)
    _set_packages(host["id"], [("curl", "7.0", 0)])
    assert _snapshot(host["id"]) is True
    _set_packages(host["id"], [("git", "2.40", 0)])   # curl removed, git added
    assert _snapshot(host["id"]) is True

    snaps = _snap_ids(client, host["id"])
    old, new = snaps[1]["snapshot_id"], snaps[0]["snapshot_id"]
    diff = client.get("/api/v1/packages/diff", params={"from_id": old, "to_id": new}).json()
    assert diff["summary"]["added"] == 1
    assert diff["summary"]["removed"] == 1
    assert diff["added"][0]["name"] == "git"
    assert diff["removed"][0]["name"] == "curl"


def test_diff_cross_host_rejected(client, login):
    a = _make_host(client)
    b = _make_host(client)
    _set_packages(a["id"], [("curl", "7.0", 0)])
    _set_packages(b["id"], [("curl", "7.0", 0)])
    _snapshot(a["id"])
    _snapshot(b["id"])
    sa = _snap_ids(client, a["id"])[0]
    sb = _snap_ids(client, b["id"])[0]
    assert client.get("/api/v1/packages/diff",
                      params={"from_id": sa["snapshot_id"], "to_id": sb["snapshot_id"]}).status_code == 400
