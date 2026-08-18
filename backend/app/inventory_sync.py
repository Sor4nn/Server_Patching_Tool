"""Inventory repository synchronization (AWX-style inventory sources).

Clones a git repo containing Ansible inventory files (INI `[group]` sections
or YAML `all.hosts`), parses the hosts/groups, and reconciles them with the
`hosts` / `host_groups` tables.

Behavior:
- hosts/groups present in the repo are upserted (created or updated)
- host vars are mapped: ansible_host -> ip_address, ansible_user -> remarks,
  ansible_os_family/ansible_distribution -> os info (best effort)
- prune_missing sources delete hosts that disappeared from the repo
- sync results are recorded back on the inventory_sources row
"""
import os
import re
import shutil
import subprocess
from contextlib import suppress
from fnmatch import fnmatch as _fnmatch
from pathlib import Path
from urllib.parse import urlparse

import yaml

from . import config, database

DEFAULT_BRANCH = "main"


def _repo_dir(source) -> Path:
    return config.DATA_DIR / "repos" / str(source["id"])


def _auth_args(source) -> tuple[list[str], dict[str, str]]:
    """Return extra git config args + env for the source auth method."""
    env = dict(os.environ)
    if source["auth_type"] == "token" and source["token"]:
        return (["-c", "http.extraHeader=Authorization: Bearer " + source["token"]], env)
    return ([], env)


def _repo_url(source) -> str:
    """Rewrite the repo URL with embedded credentials for userpass auth.

    Used only for fresh clones; pull uses the stored remote (already cloned
    with the same URL).
    """
    url = source["repo_url"]
    if source["auth_type"] == "userpass" and source["username"] and source["password"]:
        parsed = urlparse(url)
        netloc = f"{source['username']}:{source['password']}@{parsed.netloc}"
        url = parsed._replace(netloc=netloc).geturl()
    return url


def _clone_or_pull(source) -> None:
    repo_dir = _repo_dir(source)
    auth, env = _auth_args(source)
    # Fresh clone when the local copy is missing or incomplete.
    if not (repo_dir / ".git").exists():
        if repo_dir.exists():
            shutil.rmtree(repo_dir)
        repo_dir.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", "-b", source["branch"] or DEFAULT_BRANCH,
                        _repo_url(source), str(repo_dir)],
                       check=True, capture_output=True, timeout=120, env=env, text=True,
                       cwd=str(config.DATA_DIR))
        return
    # Already cloned: fetch + reset the branch so the working tree follows
    # origin. A bare `fetch <branch>` only touches FETCH_HEAD; checking out the
    # local branch without advancing it leaves the tree stale forever.
    branch = source["branch"] or DEFAULT_BRANCH
    subprocess.run(["git", "-C", str(repo_dir), "fetch", "origin", branch],
                   check=True, capture_output=True, timeout=120, env=env, text=True)
    subprocess.run(["git", "-C", str(repo_dir), "checkout", "-f", "-B", branch, f"origin/{branch}"],
                   check=True, capture_output=True, timeout=60, env=env, text=True)


def _files(repo_dir: Path, pattern: str) -> list[Path]:
    if not repo_dir.exists():
        return []
    pat = (pattern or "**/*").strip() or "**/*"
    match_all = pat in ("**/*", "*", "**")
    out = []
    for p in repo_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".ini", ".yml", ".yaml"):
            continue
        rel = p.relative_to(repo_dir).as_posix()
        if match_all or _fnmatch(rel, pat) or _fnmatch(p.name, pat):
            out.append(p)
    return out


def _parse_ini(text: str) -> dict[str, dict]:
    """Parse INI inventory into {group: {hostname: vars}}."""
    groups: dict[str, dict[str, dict]] = {}
    current = None
    host_re = re.compile(r"^\s*(\S+)(?:\s+(.*))?$")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith((";", "#", "[")):
            if line.startswith("[") and line.endswith("]"):
                current = line[1:-1].strip()
                groups.setdefault(current, {})
            continue
        m = host_re.match(line)
        if m and current:
            host = m.group(1)
            vars_str = m.group(2) or ""
            hostvars: dict[str, str] = {}
            for kv in vars_str.split():
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    hostvars[k] = v
            groups[current][host] = hostvars
    return groups


def _parse_yaml(text: str) -> dict[str, dict]:
    """Parse YAML inventory into {group: {hostname: vars}}.

    Returns {} for non-inventory YAML (e.g. playbooks, which are top-level
    lists) so they are silently skipped during inventory reconciliation.
    """
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        return {}
    if not isinstance(data, dict):
        return {}
    groups: dict[str, dict[str, dict]] = {}

    def walk(node, group_name):
        if not isinstance(node, dict):
            return
        hosts = node.get("hosts", {})
        if isinstance(hosts, dict):
            for name, vars_ in hosts.items():
                groups.setdefault(group_name, {})[str(name)] = vars_ if isinstance(vars_, dict) else {}
        for child, child_node in node.get("children", {}).items():
            walk(child_node, str(child))

    root = data.get("all", data)
    if not isinstance(root, dict):
        return {}
    walk(root, "all" if "all" in data else "ungrouped")
    return groups


def _apply_hostvars(host_vars: dict, source) -> dict:
    updates = {}
    if host_vars.get("ansible_host"):
        updates["ip_address"] = str(host_vars["ansible_host"])
    if host_vars.get("ansible_user"):
        updates["remarks"] = str(host_vars["ansible_user"])
    os_make = host_vars.get("ansible_distribution") or host_vars.get("ansible_os_family")
    if os_make:
        updates["os_make"] = str(os_make)
    if host_vars.get("ansible_distribution_version"):
        updates["os_version"] = str(host_vars["ansible_distribution_version"])
    return updates


def _is_playbook(text: str) -> bool:
    """Check if YAML text is an Ansible playbook (disambiguating from inventory)."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        return False
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                if any(k in item for k in ("tasks", "roles", "import_playbook", "include_tasks", "pre_tasks", "post_tasks", "handlers", "block")):
                    return True
                if "hosts" in item and not any(k in item for k in ("children", "vars")) and ("gather_facts" in item or "become" in item or "name" in item or "strategy" in item):
                    return True
    elif isinstance(data, dict):
        if any(k in data for k in ("tasks", "roles", "import_playbook", "pre_tasks", "post_tasks")):
            return True
    return False


def _discover_playbooks(repo_dir: Path, source: dict, conn) -> int:
    """Discover playbooks in the cloned repo matching source['playbook_pattern'] and upsert into templates."""
    pattern = source.get("playbook_pattern") or "ansible_scripts/*.yml"
    files = _files(repo_dir, pattern)
    seen_playbooks: set[str] = set()
    discovered_count = 0
    now = database.now_iso()

    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        if not _is_playbook(text):
            continue

        rel_path = f.relative_to(repo_dir).as_posix()
        seen_playbooks.add(rel_path)
        stem_name = f.stem

        existing = conn.execute(
            "SELECT id, name FROM templates WHERE inventory_source_id = %s AND playbook = %s",
            (source["id"], rel_path),
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE templates SET repo_url = %s, branch = %s, updated_at = %s WHERE id = %s",
                (source["repo_url"], source.get("branch") or DEFAULT_BRANCH, now, existing["id"]),
            )
            discovered_count += 1
        else:
            name = stem_name
            name_owner = conn.execute("SELECT id, inventory_source_id FROM templates WHERE name = %s", (name,)).fetchone()
            if name_owner:
                if name_owner["inventory_source_id"] == source["id"]:
                    conn.execute(
                        "UPDATE templates SET playbook = %s, repo_url = %s, branch = %s, updated_at = %s WHERE id = %s",
                        (rel_path, source["repo_url"], source.get("branch") or DEFAULT_BRANCH, now, name_owner["id"]),
                    )
                    discovered_count += 1
                    continue
                else:
                    name = f"{source['name']}_{stem_name}"

            conn.execute(
                "INSERT INTO templates (name, description, playbook, repo_url, branch, inventory_source_id, enabled, created_at, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, 1, %s, %s)",
                (name, f"Auto-discovered from {source['name']}", rel_path, source["repo_url"],
                 source.get("branch") or DEFAULT_BRANCH, source["id"], now, now),
            )
            discovered_count += 1

    if seen_playbooks:
        conn.execute(
            "DELETE FROM templates WHERE inventory_source_id = %s AND playbook <> ALL(%s)",
            (source["id"], list(seen_playbooks)),
        )
    else:
        conn.execute("DELETE FROM templates WHERE inventory_source_id = %s", (source["id"],))

    return discovered_count


def reconcile(conn, source) -> dict:
    """Sync the source's repo into hosts/host_groups and auto-detect playbooks into templates."""
    _clone_or_pull(source)
    repo_dir = _repo_dir(source)
    files = _files(repo_dir, source.get("file_pattern") or "**/*")

    added_groups = added_hosts = updated_hosts = removed_hosts = 0
    now = database.now_iso()
    seen_hostnames: set[str] = set()

    if files:
        groups = {}
        for f in files:
            text = f.read_text(encoding="utf-8", errors="ignore")
            parsed = _parse_yaml(text) if f.suffix.lower() in (".yml", ".yaml") else _parse_ini(text)
            for gname, hosts in parsed.items():
                if gname == "ungrouped" and "all" in groups:
                    continue
                for hname, hvars in hosts.items():
                    groups.setdefault(gname, {})[hname] = hvars

        for gname, hosts in groups.items():
            row = conn.execute("SELECT id FROM host_groups WHERE name = %s", (gname.strip(),)).fetchone()
            if row:
                group_id = row["id"]
            else:
                cur = conn.execute("INSERT INTO host_groups (name, description) VALUES (%s, %s) RETURNING id",
                                   (gname.strip(), f"Synced from {source['name']}"))
                group_id = cur.fetchone()["id"]
                added_groups += 1
            for hname, hvars in hosts.items():
                seen_hostnames.add(hname)
                hrow = conn.execute("SELECT id, hostname FROM hosts WHERE hostname = %s", (hname,)).fetchone()
                updates = _apply_hostvars(hvars, source)
                if hrow:
                    sets = ", ".join(f"{k} = %s" for k in updates) + (", " if updates else "")
                    conn.execute(f"UPDATE hosts SET {sets}group_id = %s, updated_at = %s WHERE id = %s",
                                 list(updates.values()) + [group_id, now, hrow["id"]])
                    updated_hosts += 1
                else:
                    cols = ["hostname", "group_id", "created_at", "updated_at"] + list(updates.keys())
                    vals = [hname, group_id, now, now] + list(updates.values())
                    ph = ", ".join(["%s"] * len(cols))
                    cur = conn.execute(f"INSERT INTO hosts ({', '.join(cols)}) VALUES ({ph})", vals)
                    added_hosts += 1

        if source.get("prune_missing"):
            removed_hosts = _prune_source_hosts(conn, source, seen_hostnames, groups)

    discovered_templates = _discover_playbooks(repo_dir, source, conn)
    conn.commit()

    return {"added_groups": added_groups, "added_hosts": added_hosts,
            "updated_hosts": updated_hosts, "removed_hosts": removed_hosts,
            "discovered_templates": discovered_templates, "files": len(files)}


def _prune_source_hosts(conn, source, seen: set[str], groups: dict) -> int:
    """Delete hosts that were in groups owned by this source but are gone now.

    A group created by the sync is identifiable by its description prefix.
    """
    now = database.now_iso()
    removed = 0
    for gname in groups:
        row = conn.execute("SELECT id FROM host_groups WHERE name = %s AND description LIKE %s",
                           (gname.strip(), f"Synced from {source['name']}%")).fetchone()
        if not row:
            continue
        cur = conn.execute("DELETE FROM hosts WHERE group_id = %s AND hostname <> ALL(%s)",
                           (row["id"], list(seen)))
        removed += cur.rowcount or 0
    return removed


def sync_source(source_id: int) -> dict:
    conn = database.get_connection()
    source = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    if not source:
        conn.close()
        return {"success": False, "error": "Source not found"}
    try:
        summary = reconcile(conn, dict(source))
        conn.execute(
            "UPDATE inventory_sources SET last_sync_at = %s, last_sync_status = 'success', "
            "last_error = NULL, updated_at = %s WHERE id = %s",
            (database.now_iso(), database.now_iso(), source_id),
        )
        conn.commit()
        result = {"success": True, "summary": summary}
    except Exception as e:
        conn.execute(
            "UPDATE inventory_sources SET last_sync_at = %s, last_sync_status = 'failed', "
            "last_error = %s, updated_at = %s WHERE id = %s",
            (database.now_iso(), str(e), database.now_iso(), source_id),
        )
        conn.commit()
        result = {"success": False, "error": str(e)}
    conn.close()
    return result


def sync_all_sources() -> list[dict]:
    conn = database.get_connection()
    sources = [r["id"] for r in
               conn.execute("SELECT id FROM inventory_sources WHERE enabled = 1").fetchall()]
    conn.close()
    return [sync_source(sid) for sid in sources]