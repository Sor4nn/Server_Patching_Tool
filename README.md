# GPTA — Gotta Patchem Them All

GPTA (Gotta Patchem Them All) is a server patch management and automation framework. It manages Linux server patch cycles, tracks automated patching execution status, and exposes a modern single-page dashboard with host inventory, host groups, user management, and an **AWX integration panel** for running and monitoring patch jobs.

## Architecture

Rebuilt from the ground up as a two-tier application:

- **`backend/`** — FastAPI REST API (`/api/v1/*`): session auth, dashboard stats, hosts, host groups, users, patching (AWX orchestration). Also serves the built frontend in production.
- **`frontend/`** — React + Vite + TypeScript SPA (dark sidebar layout): Login, Dashboard, Hosts (+detail), Host Groups, Patching, Users.
- **`ansible_scripts/`** — AWX playbooks consumed by AWX projects.

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

### Patching run flow

Triggering a patch run (`POST /api/v1/patching/trigger`) does:

1. Generates a `run_id` and writes the host CSV the playbook consumes.
2. Creates (or reuses) an AWX group named `gpta_<run_id>` under the master inventory and adds the target hosts.
3. Launches the job template scoped to that group, with `run_id`, `host_group`, and vault file passed in `extra_vars`.
4. Records the run — including failed runs — so operators always see the attempt.

Run status is reconciled from AWX via `POST /api/v1/patching/runs/{id}/refresh`.

### Local execution (self-hosted runner)

Instead of AWX, the **local** provider runs playbooks in a Docker execution environment via `ansible-runner`, with no external AWX dependency. Set an execution option with `provider=local` and `url=<playbook git repo>` (branch in `username`), activate it, and runs go through `docker run <execution-environment-image> ansible-runner run /runner -p <playbook>`.

- Execution environments are managed under **Assets → Exec Environments** (`/execution-environments`); the default image used for local runs is `quay.io/ansible/ansible-runner:stable-2.17-latest` unless `EXECUTION_ENVIRONMENT_IMAGE` is set.
- The backend must be able to reach the Docker daemon (host socket `/var/run/docker.sock` is mounted in the compose deployment).

### Installed RPM collection

`ansible_scripts/collect_packages.yml` collects the installed RPM list from a host (`rpm -qa`) and POSTs it to `/updatepackages`. Each host's Installed RPMs are visible on its detail page (searchable) with name, version, release, arch, and install time.

## Pre-requisites

- Python 3.10+
- Node.js 18+ and npm
- PostgreSQL 18 (database for the app)
- AWX (https://github.com/ansible/awx/tree/devel/tools/docker-compose)

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
| `ENDPOINTS_BASE_URL` | Base URL for AWX callback endpoints | `http://localhost:61008` |
| `EXECUTION_ENVIRONMENT_IMAGE` | Fallback image for local-provider runs (when no execution environment is configured) | `quay.io/ansible/ansible-runner:stable-2.17-latest` |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | Admin created on first boot | `test` / `Bogdan123!` |
| `CORS_ORIGINS` | Allowed dev origins | `http://localhost:3000` |

Copy `.env.example` to `.env` and edit the AWX vars. The default admin is `test` / `Bogdan123!`.

**AWX setup:**
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

- **Frontend (Vite)**: http://localhost:3000 — proxies `/api/*` and AWX callback paths to the backend.
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

Multi-stage build: the frontend is compiled to static assets and served by FastAPI on port `61008` inside a single image. A PostgreSQL 18 container (`db`) runs alongside and holds all data in the `gpta-pgdata` volume; user files (run CSVs, vault) persist in `gpta-data`.
