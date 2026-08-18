"""Unit tests for inventory parsing/reconciliation helpers (no DB)."""
from app import inventory_sync


def test_parse_ini_basic():
    text = """
# comment
[web]
node1 ansible_host=10.0.0.1 ansible_user=root
node2

[db]
db1 ansible_host=10.0.0.5
"""
    groups = inventory_sync._parse_ini(text)
    assert groups["web"]["node1"] == {"ansible_host": "10.0.0.1", "ansible_user": "root"}
    assert groups["web"]["node2"] == {}
    assert groups["db"]["db1"] == {"ansible_host": "10.0.0.5"}


def test_parse_yaml_inventory():
    text = """
all:
  hosts:
    node1:
      ansible_host: 192.0.2.7
  children:
    web:
      hosts:
        node2: {}
"""
    groups = inventory_sync._parse_yaml(text)
    assert groups["all"]["node1"] == {"ansible_host": "192.0.2.7"}
    assert groups["web"]["node2"] == {}


def test_parse_yaml_non_inventory_returns_empty():
    # Top-level list (a playbook) must not be treated as inventory.
    text = """
- hosts: all
  tasks:
    - debug: msg=hi
"""
    assert inventory_sync._parse_yaml(text) == {}


def test_parse_yaml_invalid_returns_empty():
    assert inventory_sync._parse_yaml("{{{{ not yaml") == {}


def test_is_playbook_detects_list_of_plays():
    assert inventory_sync._is_playbook("- hosts: all\n  tasks:\n    - ping:\n") is True


def test_is_playbook_detects_import_playbook():
    assert inventory_sync._is_playbook("- import_playbook: other.yml\n") is True


def test_is_playbook_rejects_inventory():
    assert inventory_sync._is_playbook("all:\n  hosts:\n    node1: {}\n") is False


def test_apply_hostvars_mapping():
    updates = inventory_sync._apply_hostvars(
        {"ansible_host": "10.1.1.1", "ansible_user": "ops", "ansible_distribution": "Ubuntu",
         "ansible_distribution_version": "24.04"}, {"id": 1})
    assert updates == {"ip_address": "10.1.1.1", "remarks": "ops",
                       "os_make": "Ubuntu", "os_version": "24.04"}


def test_apply_hostvars_empty():
    assert inventory_sync._apply_hostvars({}, {"id": 1}) == {}


def test_files_suffix_filter_and_match_all(tmp_path):
    (tmp_path / "ansible_scripts").mkdir()
    (tmp_path / "ansible_scripts" / "a.yml").write_text("x")
    (tmp_path / "ansible_scripts" / "b.yaml").write_text("x")
    (tmp_path / "skip.ini").write_text("x")
    (tmp_path / "readme.md").write_text("x")
    files = inventory_sync._files(tmp_path, "**/*")
    names = {p.name for p in files}
    assert names == {"a.yml", "b.yaml", "skip.ini"}
    assert "readme.md" not in names


def test_files_filename_pattern(tmp_path):
    (tmp_path / "a.yml").write_text("x")
    (tmp_path / "b.yaml").write_text("x")
    (tmp_path / "c.ini").write_text("x")
    assert {p.name for p in inventory_sync._files(tmp_path, "*.yml")} == {"a.yml"}
    assert {p.name for p in inventory_sync._files(tmp_path, "*.yaml")} == {"b.yaml"}
