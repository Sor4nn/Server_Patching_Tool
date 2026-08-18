"""Integration tests for dashboard stats (requires gpta_test Postgres)."""
import uuid

import pytest

pytestmark = pytest.mark.integration


def test_dashboard_stats_empty(client, login):
    res = client.get("/api/v1/dashboard/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["stats"]["total_hosts"] == 0
    assert body["stats"]["total_groups"] == 3  # seeded groups
    assert body["stats"]["total_users"] >= 1


def test_dashboard_stats_after_host(client, login):
    client.post("/api/v1/hosts", json={
        "hostname": f"dash-{uuid.uuid4().hex[:8]}", "ip_address": "192.0.2.77",
    })
    res = client.get("/api/v1/dashboard/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["stats"]["total_hosts"] == 1
    assert body["stats"]["not_reporting"] == 1
    assert body["total_systems"] == 1
    assert body["systems"][0]["status"] == "not_reporting"


def test_dashboard_stats_bad_status(client, login):
    res = client.get("/api/v1/dashboard/stats?status=bogus")
    assert res.status_code == 400


def test_dashboard_requires_auth(client):
    assert client.get("/api/v1/dashboard/stats").status_code == 401
