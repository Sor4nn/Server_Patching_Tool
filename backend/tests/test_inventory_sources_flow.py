"""Integration tests for the repository -> inventory -> playbook flow.

Covers the full "add a repository, sync it, see hosts + playbooks appear"
story. Real git clone is bypassed by faking `_clone_or_pull` to write the
fixture files straight into the source's repo dir; everything downstream
(parsing, reconciliation, playbook discovery) runs the real code.
"""
import uuid

import pytest

import app.inventory_sync as invsync

pytestmark = pytest.mark.integration


def _repo_url():
    return f"file:///data/repos-test-{uuid.uuid4().hex[:8]}"


def _fake_repo(source):
    """Populate the source's repo dir with a small inventory + playbook."""
    repo_dir = invsync._repo_dir(source)
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "inventory.yml").write_text(
        "all:\n"
        "  hosts:\n"
        "    testnode1:\n"
        "      ansible_host: 192.0.2.10\n"
        "  children:\n"
        "    web:\n"
        "      hosts:\n"
        "        testnode2: {}\n"
    )
    (repo_dir / "ansible_scripts").mkdir(parents=True, exist_ok=True)
    (repo_dir / "ansible_scripts" / "collect_packages.yml").write_text(
        "- hosts: all\n"
        "  gather_facts: false\n"
        "  tasks:\n"
        "    - debug:\n"
        "        msg: hello from test repo\n"
    )


def test_pull_advances_stale_clone(tmp_path, monkeypatch):
    """_clone_or_pull must update an existing clone on later syncs.

    A pull that only fetches into FETCH_HEAD and checks out the local branch
    leaves the tree pinned to the original clone — new files never arrive.
    """
    import shutil
    import subprocess

    repo_dir = invsync._repo_dir({"id": 999})
    monkeypatch.setattr(invsync, "_repo_dir", lambda source: repo_dir / str(source["id"] or "0"))
    repo_dir.mkdir(parents=True, exist_ok=True)
    remote = tmp_path / "remote"
    remote.mkdir()
    ident = ["-c", "user.email=test@test.local", "-c", "user.name=test"]

    subprocess.run(["git", "-C", str(remote), "init", "-b", "main"], check=True, capture_output=True)
    (remote / "a.txt").write_text("a")
    subprocess.run(["git", "-C", str(remote), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(remote)] + ident + ["commit", "-m", "a"],
                   check=True, capture_output=True)

    source = {"id": 999, "repo_url": f"file://{remote}", "branch": "main",
              "auth_type": "none", "username": "", "password": "", "token": ""}
    invsync._clone_or_pull(source)
    assert (invsync._repo_dir(source) / "a.txt").exists()

    (remote / "b.txt").write_text("b")
    subprocess.run(["git", "-C", str(remote), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(remote)] + ident + ["commit", "-m", "b"],
                   check=True, capture_output=True)

    invsync._clone_or_pull(source)
    assert (invsync._repo_dir(source) / "b.txt").exists()

    shutil.rmtree(repo_dir, ignore_errors=True)


def test_add_repo_sync_discovers_hosts_and_playbooks(client, login, monkeypatch):
    monkeypatch.setattr(invsync, "_clone_or_pull", lambda source: _fake_repo(source))

    res = client.post("/api/v1/inventory-sources", json={
        "name": f"test-repo-{uuid.uuid4().hex[:8]}",
        "repo_url": _repo_url(),
        "branch": "main",
        "file_pattern": "**/*",
        "playbook_pattern": "ansible_scripts/*.yml",
    })
    assert res.status_code == 200, res.text
    source_id = res.json()["source"]["id"]

    res = client.post(f"/api/v1/inventory-sources/{source_id}/sync")
    assert res.status_code == 200, res.text
    summary = res.json()["summary"]
    assert summary["added_groups"] == 2
    assert summary["added_hosts"] == 2
    assert summary["discovered_templates"] == 1

    # Hosts landed in the DB and are listed
    res = client.get("/api/v1/hosts")
    names = {h["hostname"] for h in res.json()["hosts"]}
    assert {"testnode1", "testnode2"} <= names

    # The playbook became a visible template bound to this source
    res = client.get("/api/v1/templates")
    tpls = [t for t in res.json()["templates"] if t.get("inventory_source_id") == source_id]
    assert len(tpls) == 1
    assert tpls[0]["playbook"] == "ansible_scripts/collect_packages.yml"

    # Source listing reports counts
    res = client.get("/api/v1/inventory-sources")
    src = next(s for s in res.json()["sources"] if s["id"] == source_id)
    assert src["host_count"] == 2
    assert src["template_count"] == 1
    assert src["last_sync_status"] == "success"


def test_sync_records_failure(client, login, monkeypatch):
    def _boom(source):
        raise RuntimeError("git clone failed")
    monkeypatch.setattr(invsync, "_clone_or_pull", _boom)

    res = client.post("/api/v1/inventory-sources", json={
        "name": f"bad-repo-{uuid.uuid4().hex[:8]}", "repo_url": _repo_url(),
    })
    source_id = res.json()["source"]["id"]

    res = client.post(f"/api/v1/inventory-sources/{source_id}/sync")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert "clone failed" in body["error"]

    res = client.get("/api/v1/inventory-sources")
    src = next(s for s in res.json()["sources"] if s["id"] == source_id)
    assert src["last_sync_status"] == "failed"
    assert "clone failed" in src["last_error"]


def test_viewer_cannot_create_or_sync_repo(client, viewer):
    res = client.post("/api/v1/inventory-sources", json={"name": "nope", "repo_url": _repo_url()})
    assert res.status_code == 403
    res = client.post("/api/v1/inventory-sources/1/sync")
    assert res.status_code == 403
