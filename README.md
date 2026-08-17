# GPTA — Gotta Patchem Them All

GPTA (Gotta Patchem Them All) is a server patch management and automation framework. It manages Linux server patch cycles, tracks automated patching execution status, and exposes a modern single-page dashboard with host inventory, host groups, user management, and an **AWX integration panel** for running and monitoring patch jobs.

## Architecture

Rebuilt from the ground up as a two-tier application:

- **`backend/`** — FastAPI REST API (`/api/v1/*`): session auth, dashboard stats, hosts, host groups, users, patching (AWX orchestration). Also serves the built frontend in production.
- **`frontend/`** — React + Vite + TypeScript SPA (dark sidebar layout): Login, Dashboard, Hosts (+detail), Host Groups, Patching, Users.
- **`ansible_scripts/`** — AWX playbooks consumed by AWX projects.
- **`legacy/`** — Archived original Django portal + old FastAPI endpoints (kept for reference; not part of the app).

### Backward-compatible AWX callbacks

Existing AWX playbooks and webhook notifications keep working unchanged. These root paths are exposed by the backend and map onto the new schema:

| Path | Purpose |
| --- | --- |
| `/generate_runid` | Generate a run id (creates a `patch_runs` row) |
| `/update_runid` | AWX webhook notification — update run status |
| `/updatelatestpatch` | Playbook callback — update host `latest_patch` / `uptime` |
| `/patch_task` | Create/update a host from playbook data |
| `/updateaction` / `/updateremarks` / `/updateonboard` | Update per-host patch state |

## Pre-requisites

- Python 3.10+
- Node.js 18+ and npm
- AWX (https://github.com/ansible/awx/tree/devel/tools/docker-compose)

## Configuration

The application is fully **environment-variable driven**.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DB_URL` | SQLite database path | `<repo>/data/gpta.db` |
| `AWX_PROTOCOL` / `AWX_HOST` / `AWX_PORT` | AWX REST API endpoint | `https` / `YourHost` / `8443` |
| `AWX_USERNAME` / `AWX_PASSWORD` | AWX REST API credentials | placeholders |
| `AWX_VAULT_ID` / `AWX_OMD_SSH_KEY_CRED_ID` / `AWX_ITOPS_SSH_KEY_CRED_ID` | AWX credential ids | `3` / `4` / `5` |
| `ENDPOINTS_BASE_URL` | Base URL for AWX callback endpoints | `http://localhost:61008` |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | Admin created on first boot | `test` / `Bogdan123!` |
| `CORS_ORIGINS` | Allowed dev origins | `http://localhost:3000` |

Copy `.env.example` to `.env` and edit the AWX vars. The default admin is `test` / `Bogdan123!`.

**AWX setup:**
- Add the SSH key used to access remote servers.
- Create a project and add the playbooks from `ansible_scripts/`.
- Create an inventory.
- Add a success/error webhook notification with target URL `http://YOUR_ENDPOINTS_HOST:61008/update_runid` (POST).

## Development

```bash
npm run setup     # install Python + frontend deps
npm run dev       # starts backend (:61008) + Vite (:3000) together
```

- **Frontend (Vite)**: http://localhost:3000 — proxies `/api/*` and AWX callback paths to the backend.
- **Backend (FastAPI)**: http://localhost:61008 — Swagger UI at `/docs`.

The SQLite database is created automatically on first start (schema + seed admin + default groups).

## Docker

```bash
cp .env.example .env
# edit .env with your AWX host/credentials
docker compose up -d --build
```

Multi-stage build: the frontend is compiled to static assets and served by FastAPI on port `61008` inside a single image. Data persists in the `gpta-data` volume.
