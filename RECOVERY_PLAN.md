# Server Patching Tool — Recovery Plan

Created: 2026-08-17

## Root Cause Analysis

The app has four disconnected subsystems that should work together.

### 1. Repos (Inventory Sources) ↔ Templates: NOT LINKED
- `inventory_sources` clones a repo and parses files matching `file_pattern` as
  inventory files (INI `[group]` sections or YAML `all.hosts` structure) —
  `inventory_sync.py:120-140`.
- `templates` table has its own `repo_url`/`branch`, cloned separately by the
  local runner — `templates.py:197-208`, `local_runner.py:45-56`.
- No foreign key, no shared clone. Even if both point to the same repo URL,
  they're cloned twice and never cross-reference.
- The user set `file_pattern: ansible_scripts/` on the inventory source, but
  `ansible_scripts/` contains playbooks, not inventory files. The sync parses
  them as inventory (`_parse_yaml` looks for `all.hosts`/`children`), finds
  nothing -> "synced successfully" but 0 hosts detected. That's why the repo
  appears "not connected."

### 2. Patching Page Uses AWX Templates, Not DB Templates
- `Patching.tsx:61` loads templates from `api.awxTemplates()` ->
  `/patching/templates` -> `awx.get_job_templates_list()` — requires a
  reachable AWX.
- The active execution option is a placeholder
  (`https://YourHost:8443`, user `<username>`, pass `<password>`) -> AWX
  unreachable -> "AWX unreachable — no job templates detected."
- DB templates (`/templates`) — which actually work via the local runner —
  are never shown on the Patching page. Only on the Templates page.

### 3. Connection Status Inconsistency
- Stat card `connectedCount = hosts.filter(h => h.state !== 'Blocked').length`
  — `Hosts.tsx:68`. Since `state` is `null` for a never-patched host,
  `null !== 'Blocked'` is true -> counted as "Connected."
- Table "Connection" column uses `!!h.last_seen` — `Hosts.tsx:200`.
  `last_seen` is null -> shows "Unknown."
- Result: stat card says "1 Connected" but the row says "Unknown" for the
  same host.

### 4. Local Provider Misconfigured
- `execution_options.py:40-41`: when `provider == "local"`, the option's
  `url` is the playbook git repo and `username` is used as the branch
  (`patching.py:152-158`). This is a confusing overload.
- The active option is `provider: awx` with a placeholder URL, so
  `orchestrate_run` routes to `_orchestrate_awx` (unreachable) instead of
  `run_local_playbook`.

---

## Phase 1 — Link Repos to Templates (auto-detect playbooks on sync)

**Trigger:** Auto on every repo sync (confirmed).

### Schema changes (`database.py`)
- Add `inventory_source_id INTEGER REFERENCES inventory_sources(id)
  ON DELETE CASCADE` to `templates` table (nullable).
- Add `playbook_pattern TEXT NOT NULL DEFAULT 'ansible_scripts/*.yml'` to
  `inventory_sources` table.
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for migration on existing
  DBs (current schema uses `CREATE TABLE IF NOT EXISTS`, no migrations).

### Backend (`inventory_sync.py`)
- After `reconcile()` clones/pulls the repo, add
  `_discover_playbooks(repo_dir, source, conn)`:
  - Glob files matching `source["playbook_pattern"]`.
  - For each `.yml`/`.yaml`, parse and check for top-level
    `hosts:`/`tasks:`/`roles:` keys -> it's a playbook. Use `tasks:`/`roles:`
    to disambiguate from inventory YAML.
  - Upsert into `templates`: `name` = playbook stem (e.g.,
    `collect_packages`), `playbook` = relative path, `repo_url` =
    `source["repo_url"]`, `branch` = `source["branch"]`,
    `inventory_source_id` = `source["id"]`.
  - Remove templates whose playbook file disappeared from the repo (only
    those linked to this source).
- Call `_discover_playbooks()` at the end of `reconcile()`, before commit.

### Frontend (`InventorySources.tsx`)
- Add `playbook_pattern` field to create/edit modal.
- Show detected template count per source in the list.

---

## Phase 2 — Patching Page Uses DB Templates

### Frontend (`Patching.tsx:61`)
- Replace `api.awxTemplates()` with `api.listTemplates()`.
- Button binding dropdown (`Patching.tsx:701`) populates from DB templates.
- Update copy: "AWX unreachable" -> "No templates found — sync a repo or
  create one."
- If AWX is active + reachable, optionally merge AWX templates (future
  enhancement; for now DB-only).

---

## Phase 3 — Connection Status Consistency

**Definition:** `Connected` = `last_seen` not null (confirmed).

### Frontend (`Hosts.tsx:68`)
- Change
  `connectedCount = hosts.filter((h) => h.state !== 'Blocked').length`
  -> `hosts.filter((h) => !!h.last_seen).length`.
- `offlineCount` becomes `totalCount - connectedCount` (already computed
  that way — now correct).

---

## Phase 4 — Local Provider as Default + Fix Branch Bug

### Backend (`patching.py:152-158`)
- When `provider == "local"`, use the template's `repo_url`/`branch`
  (passed through `orchestrate_run`), not the execution option's
  `url`/`username`. The execution option only selects the provider.
- Fix `branch=option.get("username")` bug -> use template's branch.

### Backend (`execution_options.py`)
- Add a `branch` column to `execution_options` (stop overloading
  `username` as branch).
- Seed/update a default "Local Runner" execution option with
  `provider: local`.

### Backend (`database.py`)
- Add `branch TEXT` to `execution_options` schema
  (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

### Caller verification
- Verify all `orchestrate_run` callers (`trigger`, scheduler, button runs)
  pass template's repo/branch.

---

## Execution Order
1. Phase 3 (smallest, immediate visible fix for the connection mismatch).
2. Phase 4 (unblocks local patching without AWX).
3. Phase 2 (Patching page shows DB templates).
4. Phase 1 (largest — schema + discovery + UI).

## Risks
- **Phase 1 schema migration:** adding columns to existing tables — need
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (current schema uses
  `CREATE TABLE IF NOT EXISTS`, no migrations).
- **Phase 4 branch bug fix:** changes `orchestrate_run` signature behavior.
  Verify all callers pass template's repo/branch.
- **Playbook detection heuristics:** a YAML file with `hosts:` could be an
  inventory OR a playbook. Check for `tasks:`/`roles:` (playbook-only keys)
  to disambiguate.
