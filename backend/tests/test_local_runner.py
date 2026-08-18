"""Unit tests for local runner helpers (no DB, no docker)."""
from app import local_runner


def test_connection_vars_no_credential():
    tokens, key = local_runner._connection_vars(None)
    assert "ansible_ssh_common_args=" in tokens[0]
    assert key is None


def test_connection_vars_ssh_key():
    tokens, key = local_runner._connection_vars(
        {"username": "root", "credential_type": "ssh_key", "private_key": "PRIVATE"})
    assert any("ansible_user='root'" in t for t in tokens)
    assert key == "PRIVATE"


def test_connection_vars_ssh_password():
    tokens, key = local_runner._connection_vars(
        {"username": "admin", "credential_type": "ssh_password", "password": "pw"})
    assert any("ansible_ssh_pass='pw'" in t for t in tokens)
    assert key is None


def test_connection_vars_strips_key_for_password_type():
    _, key = local_runner._connection_vars(
        {"credential_type": "ssh_password", "password": "pw", "private_key": "SHOULD_NOT_LEAK"})
    assert key is None


def test_playbook_by_run_type_mapping():
    assert local_runner.PLAYBOOK_BY_RUN_TYPE["apply"] == "onepatch_execution.yml"
    assert local_runner.PLAYBOOK_BY_RUN_TYPE["check_updates"] == "check_updates.yml"
