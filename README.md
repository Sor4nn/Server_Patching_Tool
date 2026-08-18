# GPTA — Gotta Patchem Them All

GPTA (Gotta Patchem Them All) is a server patch management and automation framework. It manages Linux server patch cycles, tracks automated patching execution, and exposes a single-page dashboard for host inventory, host groups, package/update tracking, services, and scheduling.

## Architecture

Two-tier application:

- **`backend/`** — FastAPI REST API (`/api/v1/*`): session auth, dashboard stats, hosts, host groups, users, packages, services, patching orchestration, policies, templates, credentials, execution environments, and the AWX-compatible callback paths. Also serves the built frontend in production.
- **`frontend/`** — React + Vite + TypeScript SPA (dark sidebar layout): Dashboard, Hosts (+detail), Host Groups, Packages, Run Patching, Patching, Integration, Automation Options, Templates, Credentials, Exec Environments, Services, Compliance, Reporting, Settings.
- **`ansible_scripts/`** — Playbooks consumed by the local runner (and importable into an AWX project): `collect_packages.yml`, `check_updates.yml`, `get_server_details.yml`, `check_services.yml`, `restart_service.yml`.

## Execution model

Runs are dispatched by an **active execution option**. Two providers are supported:

- **`local`** (default, no AWX required) — playbooks run in a Docker execution environment via `ansible-runner`. The backend must reach the Docker daemon (the compose deployment mounts `/var/run/docker.sock`). Each run clones the template's `repo_url:branch`, builds an inventory from the target hosts, and streams output live to the Run page.
- **`awx`** — launches an AWX job template and reconciles run status via `POST /api/v1/patching/runs/{id}/refresh`.

Execution options and run output are managed under **Patching → Integration** (`/integration`). Only one option is active at a time.

### Templates and action buttons

Templates (**Patching → Templates**) define a playbook, `repo_url`, `branch`, credential, and execution environment. Templates are bound to the Run page actions on that page:

| Action | Purpose | Default playbook |
| --- | --- | --- |
| Snapshot | Take a config/package snapshot | — |
| Patching | Apply available patches | — |
| Check Packages | Re-scan installed packages | `collect_packages.yml` |
| Pending Update | Check for pending updates | `check_updates.yml` |

When an action is triggered, the backend resolves it through the button binding, then falls back to a template whose name or playbook matches the action.

### Patching run flow

Triggering a run (`POST /api/v1/patching/run`) or a bound action button:

1. Resolves the target hosts (explicit ids, host groups, and/or comma-separated hostnames/IPs).
2. Resolves the template/playbook for the action.
3. Runs the playbook against the hosts — through AWX or the local runner — streaming console output live to the Run page terminal.
4. Records the run (including failures) in `patch_runs` so the outcome is always visible.

### Policies (scheduling)

**Patching → Automation Options** (`/automation-options`) attaches a template to a scheduled policy: immediate, delayed (`delay_minutes`), or fixed time (UTC). Assignments pick host groups/hosts; exclusions subtract hosts. A scheduler thread checks due policies and emits a run for each.

### Package tracking

- `collect_packages.yml` records the installed RPM inventory (`/updatepackages`).
- `check_updates.yml` reports `available_version` / `needs_update` / CVE info per package.

The `/updatepackages` callback upserts packages and **preserves** the pending-update flags when the incoming payload carries no update info (e.g. an inventory-only report), so a plain collect never reports everything as up to date. Package views and counts on the Dashboard, Run page, and Packages page come from this data.

### Backward-compatible AWX callbacks

Existing AWX playbooks and webhook notifications keep working unchanged. These root paths are exposed by the backend and map onto the new schema:

| Path | Purpose |
| --- | --- |
| `/generate_runid` | Generate a run id (creates a `patch_runs` row) |
| `/update_runid` | AWX webhook notification — update run status |
| `/updatelatestpatch` | Playbook callback — update host `latest_patch` / `uptime` |
| `/updatepackages` | Playbook callback — record installed RPM list for a host |
| `/patch_task` | Create/update a host from playbook data |
| `/updateaction` / `/updateremarks` / `/updateonboard` | Update per-host patch state |

## Pre-requisites

- Python 3.10+
- Node.js 18+ and npm
- PostgreSQL 18 (database for the app)
- Docker (for local-provider runs via `ansible-runner`)

## Configuration

The application is fully **environment-variable driven**.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_NAME` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_HOST` / `DATABASE_PORT` | PostgreSQL 18 connection | `gpta` / `gpta` / `gpta` / `localhost` / `5432` |
| `AWX_PROTOCOL` / `AWX_HOST` / `AWX_PORT` | AWX REST API endpoint | `https` / `YourHost` / `8443` |
| `AWX_AUTH_MODE` | `basic` (user:password) or `token` (OAuth2 Bearer) | `basic` |
| `AWX_USERNAME` / `AWX_PASSWORD` | AWX credentials (used when `AWX_AUTH_MODE=basic`) | placeholders |
| `AWX_TOKEN` | AWX personal access token (used when `AWX_AUTH_MODE=token`, sent as `Authorization: Bearer`) | empty |
| `AWX_VAULT_ID` / `AWX_OMD_SSH_KEY_CRED_ID` / `AWX_ITOPS_SSH_KEY_CRED_ID` | AWX credential ids | `3` / `4` / `5` |
| `AWX_MASTER_INVENTORY` / `AWX_PROJECT` | AWX inventory / project names | `master_inventory` / `zeroops` |
| `ENDPOINTS_BASE_URL` | Base URL for callback endpoints | `http://localhost:61008` |
| `EXECUTION_ENVIRONMENT_IMAGE` | Fallback image for local-provider runs (when no execution environment is configured) | `quay.io/ansible/ansible-runner:stable-2.17-latest` |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | Admin created on first boot | `test` / `Bogdan123!` |
| `CORS_ORIGINS` | Allowed dev origins | `http://localhost:3000` |

Copy `.env.example` to `.env` and edit the vars. The default admin is `test` / `Bogdan123!`.

**AWX setup** (only when using the `awx` provider):
- Add the SSH key used to access remote servers.
- Create a project and add the playbooks from `ansible_scripts/`.
- Create an inventory.
- Add a success/error webhook notification with target URL `http://YOUR_ENDPOINTS_HOST:61008/update_runid` (POST).
- Authentication is either **Basic** (`AWX_AUTH_MODE=basic` + username/password) or an **OAuth2 token** (`AWX_AUTH_MODE=token` + `AWX_TOKEN`, sent as a Bearer token). Personal access tokens are created in the AWX UI under your user profile, or via `POST /api/v2/users/{id}/personal_tokens/`.

## Development

```bash
npm run setup     # install Python + frontend deps
npm run dev       # starts backend (:61008) + Vite (:3000) together
```

- **Frontend (Vite)**: http://localhost:3000 — proxies `/api/*` and callback paths to the backend.
- **Backend (FastAPI)**: http://localhost:61008 — Swagger UI at `/docs`.

The PostgreSQL schema is created automatically on first start (tables + seed admin + default groups). Create the database first:

```bash
createdb gpta  # or: CREATE DATABASE gpta;
```

To migrate an existing SQLite database to PostgreSQL:

```bash
python backend/scripts/migrate_sqlite_to_pg.py
```

## Docker

```bash
cp .env.example .env
# edit .env with your AWX host/credentials
docker compose up -d --build
```

Multi-stage build: the frontend is compiled to static assets and served by FastAPI on port `61008` inside a single image. A PostgreSQL 18 container (`db`) runs alongside and holds all data in the `gpta-pgdata` volume; run artifacts (CSVs, vault, run output) persist in `gpta-data`.