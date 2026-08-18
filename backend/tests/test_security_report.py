"""Integration tests for the security report (requires gpta_test Postgres)."""
import uuid

import pytest

pytestmark = pytest.mark.integration


def _make_host(client, suffix=""):
    return client.post("/api/v1/hosts", json={
        "hostname": f"sec-{uuid.uuid4().hex[:8]}{suffix}",
        "ip_address": "192.0.2.11",
        "os_make": "Ubuntu",
        "os_version": "24.04",
    }).json()["host"]


def _seed_packages(host_id, with_outdated=False, with_security=False):
    from app import database
    conn = database.get_connection()
    now = database.now_iso()
    conn.execute(
        "INSERT INTO host_packages (host_id, name, version, release, arch, created_at, "
        "available_version, needs_update, is_security_update, cves) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (host_id, "curl", "1.0", "1", "x86_64", now, "1.2", int(with_outdated),
         int(with_security), "CVE-2026-0001" if with_security else None),
    )
    conn.execute(
        "INSERT INTO host_packages (host_id, name, version, release, arch, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (host_id, "bash", "5.2", "1", "x86_64", now),
    )
    conn.commit()
    conn.close()


def test_security_report_empty(client, login):
    res = client.get("/api/v1/security/report")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["generated_at"]
    assert body["summary"]["total_hosts"] == 0
    assert body["hosts"] == []


def test_security_report_categorises_hosts(client, login):
    good = _make_host(client, "a")
    bad = _make_host(client, "b")
    _seed_packages(good["id"])
    _seed_packages(bad["id"], with_outdated=True, with_security=True)
    client.patch(f"/api/v1/hosts/{good['id']}", json={"remarks": "ok"})
    from app import database
    conn = database.get_connection()
    conn.execute("UPDATE hosts SET last_seen = %s WHERE id IN (%s, %s)",
                 (database.now_iso(), good["id"], bad["id"]))
    conn.commit()
    conn.close()

    res = client.get("/api/v1/security/report")
    body = res.json()
    assert body["summary"]["total_hosts"] == 2
    assert body["summary"]["reporting"] == 2
    assert body["summary"]["up_to_date"] == 1
    assert body["summary"]["needs_updates"] == 1
    assert body["summary"]["outdated_packages"] == 1
    assert body["summary"]["security_updates"] == 1
    assert body["summary"]["hosts_with_cves"] == 1
    assert body["summary"]["patch_coverage_pct"] == 50.0

    by_host = {h["hostname"]: h for h in body["hosts"]}
    assert by_host[bad["hostname"]]["status"] == "needs_updates"
    assert by_host[bad["hostname"]]["security_count"] == 1
    assert by_host[good["hostname"]]["status"] == "up_to_date"

    assert any(g["name"] == "Ungrouped" and g["total"] == 2 for g in body["groups"])
    assert any(o["name"] == "Ubuntu" and o["total"] == 2 for o in body["os"])


def test_security_report_csv(client, login):
    _make_host(client)
    res = client.get("/api/v1/security/report.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.text
    assert text.splitlines()[0].startswith("hostname,")
    assert "not_reporting" in text


def test_security_report_bad_status(client, login):
    assert client.get("/api/v1/security/report?status=bogus").status_code == 400


def test_security_report_requires_auth(client):
    assert client.get("/api/v1/security/report").status_code == 401