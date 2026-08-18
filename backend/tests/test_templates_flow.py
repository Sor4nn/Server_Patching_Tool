"""Integration tests for template CRUD + running a playbook.

The actual docker/ansible-runner invocation in local_runner.run_playbook is
mocked; everything up to and around it (record-keeping, run history, error
handling) runs the real code.
"""
import uuid

import pytest

import app.local_runner

pytestmark = pytest.mark.integration


def _create_host(client, hostname):
    res = client.post("/api/v1/hosts", json={"hostname": hostname, "ip_address": "192.0.2.99"})
    assert res.status_code == 200, res.text
    return res.json()["host"]


def _create_template(client, name, enabled=1, repo_url=None):
    res = client.post("/api/v1/templates", json={
        "name": name,
        "playbook": "ansible_scripts/test_ping.yml",
        "repo_url": repo_url or f"file:///data/repos-test-{uuid.uuid4().hex[:8]}",
        "branch": "main",
        "enabled": enabled,
    })
    assert res.status_code == 200, res.text
    return res.json()["template"]


def _fake_success_result(**kwargs):
    return {"success": True, "exit_code": 0, "output": "PLAY OK - test ping", "artifacts_dir": "/tmp/x",
            "image": "test-ee"}


def _fake_failure_result(**kwargs):
    return {"success": False, "exit_code": 1, "error": "boom", "output": "FAILED"}


def test_create_list_update_delete_template(client, login):
    tpl = _create_template(client, f"tpl-{uuid.uuid4().hex[:8]}")
    assert tpl["enabled"] == 1

    res = client.get("/api/v1/templates")
    assert any(t["id"] == tpl["id"] for t in res.json()["templates"])

    res = client.put(f"/api/v1/templates/{tpl['id']}", json={"enabled": 0})
    assert res.status_code == 200
    assert res.json()["template"]["enabled"] == 0

    res = client.delete(f"/api/v1/templates/{tpl['id']}")
    assert res.status_code == 200
    assert client.get("/api/v1/templates").json()["templates"] == []


def test_run_template_records_successful_run(client, login, monkeypatch):
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_success_result)
    host = _create_host(client, f"run-host-{uuid.uuid4().hex[:8]}")
    tpl = _create_template(client, f"run-tpl-{uuid.uuid4().hex[:8]}")

    res = client.post(f"/api/v1/templates/{tpl['id']}/run", json={"host_ids": [host["id"]]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    run = body["run"]
    assert run["status"] == "successful"
    assert run["template_id"] == tpl["id"]
    assert run["host_count"] == 1
    assert "PLAY OK" in body["local"]["output"]

    # Run shows up in history
    res = client.get("/api/v1/patching/runs")
    assert any(r["run_id"] == run["run_id"] for r in res.json()["runs"])


def test_run_template_records_failed_run(client, login, monkeypatch):
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_failure_result)
    host = _create_host(client, f"fail-host-{uuid.uuid4().hex[:8]}")
    tpl = _create_template(client, f"fail-tpl-{uuid.uuid4().hex[:8]}")

    res = client.post(f"/api/v1/templates/{tpl['id']}/run", json={"host_ids": [host["id"]]})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert body["error"] == "boom"
    assert body["run"]["status"] == "failed"


def test_run_template_bad_extra_vars(client, login, monkeypatch):
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_success_result)
    host = _create_host(client, f"ev-host-{uuid.uuid4().hex[:8]}")
    tpl = _create_template(client, f"ev-tpl-{uuid.uuid4().hex[:8]}")

    res = client.post(f"/api/v1/templates/{tpl['id']}/run",
                      json={"host_ids": [host["id"]], "extra_vars": "{not json"})
    assert res.status_code == 400


def test_run_disabled_template(client, login, monkeypatch):
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_success_result)
    host = _create_host(client, f"dis-host-{uuid.uuid4().hex[:8]}")
    tpl = _create_template(client, f"dis-tpl-{uuid.uuid4().hex[:8]}", enabled=0)

    res = client.post(f"/api/v1/templates/{tpl['id']}/run", json={"host_ids": [host["id"]]})
    assert res.status_code == 400


def test_run_template_requires_host(client, login, monkeypatch):
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_success_result)
    tpl = _create_template(client, f"nohost-tpl-{uuid.uuid4().hex[:8]}")
    res = client.post(f"/api/v1/templates/{tpl['id']}/run", json={"host_ids": []})
    assert res.status_code == 400


def test_viewer_cannot_create_or_run_template(client, viewer):
    res = client.post("/api/v1/templates", json={
        "name": "nope", "playbook": "p.yml", "repo_url": "https://github.com/x/y.git",
    })
    assert res.status_code == 403
    res = client.post("/api/v1/templates/1/run", json={"host_ids": [1]})
    assert res.status_code == 403


def test_run_action_button_flow(client, login, monkeypatch):
    """Patching Run page action button: pick a template, run against a host."""
    monkeypatch.setattr(app.local_runner, "run_playbook", _fake_success_result)
    host = _create_host(client, f"btn-host-{uuid.uuid4().hex[:8]}")
    # Name contains the action hint so _resolve_template maps check_packages to it.
    _create_template(client, f"collect_packages-btn-{uuid.uuid4().hex[:8]}")

    res = client.post("/api/v1/patching/run",
                      json={"action": "check_packages", "host_ids": [host["id"]]})
    assert res.status_code == 200, res.text
    assert res.json()["run"]["status"] == "running"

    # Async worker runs in a thread; poll history until it settles.
    import time
    run_id = res.json()["run"]["id"]
    for _ in range(50):
        res = client.get(f"/api/v1/patching/runs/{run_id}")
        status = res.json()["run"]["status"]
        if status in ("successful", "failed"):
            break
        time.sleep(0.1)
    assert status == "successful"
