"""Integration tests for the hosts CRUD flow (requires gpta_test Postgres)."""
import pytest

pytestmark = pytest.mark.integration


def _create_host(client, hostname, ip="192.0.2.50"):
    res = client.post("/api/v1/hosts", json={
        "hostname": hostname, "ip_address": ip, "os_make": "Ubuntu", "os_version": "24.04",
    })
    assert res.status_code == 200, res.text
    return res.json()["host"]


def test_create_list_update_delete(client, login):
    host = _create_host(client, "srv-a")
    host_id = host["id"]
    assert host["hostname"] == "srv-a"

    res = client.get("/api/v1/hosts")
    assert res.status_code == 200
    names = {h["hostname"] for h in res.json()["hosts"]}
    assert "srv-a" in names

    res = client.patch(f"/api/v1/hosts/{host_id}", json={"friendly_name": "Primary"})
    assert res.status_code == 200
    assert res.json()["host"]["friendly_name"] == "Primary"

    res = client.delete(f"/api/v1/hosts/{host_id}")
    assert res.status_code == 200
    assert client.get("/api/v1/hosts/{0}".format(host_id)).status_code == 404


def test_create_duplicate_host_409(client, login):
    _create_host(client, "dup-host")
    res = client.post("/api/v1/hosts", json={"hostname": "dup-host"})
    assert res.status_code == 409


def test_host_detail_and_packages(client, login):
    host = _create_host(client, "pkg-host")
    res = client.get(f"/api/v1/hosts/{host['id']}")
    assert res.status_code == 200
    res = client.get(f"/api/v1/hosts/{host['id']}/packages")
    assert res.status_code == 200
    assert res.json()["packages"] == []


def test_viewer_cannot_create_host(client, viewer):
    res = client.post("/api/v1/hosts", json={"hostname": "should-not-exist"})
    assert res.status_code == 403


def test_host_stats(client, login):
    _create_host(client, "stat-host")
    res = client.get("/api/v1/hosts/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total"] >= 1
