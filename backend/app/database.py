import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row

from . import config

IntegrityError = psycopg.errors.UniqueViolation


def get_connection():
    conn = psycopg.connect(
        dbname=config.DATABASE_NAME,
        user=config.DATABASE_USER,
        password=config.DATABASE_PASSWORD,
        host=config.DATABASE_HOST,
        port=config.DATABASE_PORT,
        row_factory=dict_row,
    )
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS host_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS hosts (
    id SERIAL PRIMARY KEY,
    hostname TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    os_make TEXT,
    os_version TEXT,
    latest_patch TEXT,
    uptime TEXT,
    state TEXT,
    action TEXT,
    remarks TEXT,
    friendly_name TEXT,
    group_id INTEGER REFERENCES host_groups(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen TEXT
);

CREATE TABLE IF NOT EXISTS patch_runs (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    template_id INTEGER,
    template_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    type TEXT,
    extra_vars TEXT,
    host_count INTEGER DEFAULT 0,
    created_by TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS host_packages (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    version TEXT,
    release TEXT,
    arch TEXT,
    epoch TEXT,
    source TEXT,
    installed_at TEXT,
    created_at TEXT NOT NULL,
    available_version TEXT,
    needs_update INTEGER NOT NULL DEFAULT 0,
    is_security_update INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    UNIQUE(host_id, name, version, release, arch)
);
CREATE INDEX IF NOT EXISTS idx_host_packages_host ON host_packages(host_id);

CREATE TABLE IF NOT EXISTS patch_policies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    patch_delay_type TEXT NOT NULL DEFAULT 'immediate',
    delay_minutes INTEGER,
    fixed_time_utc TEXT,
    template_id INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_assignments (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES patch_policies(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,  -- host | host_group
    target_id INTEGER NOT NULL,
    UNIQUE(policy_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS policy_exclusions (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES patch_policies(id) ON DELETE CASCADE,
    host_id INTEGER NOT NULL,
    UNIQUE(policy_id, host_id)
);

CREATE TABLE IF NOT EXISTS execution_options (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'awx',  -- awx | jenkins | local
    url TEXT NOT NULL,
    branch TEXT,
    auth_mode TEXT NOT NULL DEFAULT 'basic',  -- basic | token
    username TEXT,
    password TEXT,
    token TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS button_bindings (
    id SERIAL PRIMARY KEY,
    button_key TEXT NOT NULL UNIQUE,  -- apply | snapshot | <custom>
    button_label TEXT,
    template_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_environments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    image TEXT NOT NULL,  -- container image ansible-runner runs in (e.g. quay.io/ansible/ansible-runner:stable-2.17-latest)
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_sources (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    repo_url TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    auth_type TEXT NOT NULL DEFAULT 'none',  -- none | token | ssh | userpass
    username TEXT,
    password TEXT,
    token TEXT,
    file_pattern TEXT NOT NULL DEFAULT '**/*',  -- git refs processed (ini/yml/yaml hosts)
    playbook_pattern TEXT NOT NULL DEFAULT 'ansible_scripts/*.yml',
    prune_missing INTEGER NOT NULL DEFAULT 0,   -- delete hosts absent from the repo
    enabled INTEGER NOT NULL DEFAULT 1,
    last_sync_at TEXT,
    last_sync_status TEXT,  -- success | failed
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    credential_type TEXT NOT NULL,  -- ssh_key | ssh_password
    username TEXT,
    password TEXT,
    private_key TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    playbook TEXT NOT NULL,       -- path to the playbook inside the repo
    repo_url TEXT NOT NULL,       -- git repo holding the playbook
    branch TEXT NOT NULL DEFAULT 'main',
    inventory_source_id INTEGER REFERENCES inventory_sources(id) ON DELETE CASCADE,
    credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
    execution_environment_id INTEGER REFERENCES execution_environments(id) ON DELETE SET NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS critical_services (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS host_services (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    load_state TEXT,      -- loaded|not-found|masked|error
    active_state TEXT,    -- active|inactive|failed|activating|deactivating
    sub_state TEXT,       -- running|dead|exited|failed
    is_critical INTEGER NOT NULL DEFAULT 0,
    last_checked TEXT,
    UNIQUE(host_id, service_name)
);
CREATE INDEX IF NOT EXISTS idx_host_services_host ON host_services(host_id);

CREATE TABLE IF NOT EXISTS host_filesystems (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    mount TEXT NOT NULL,
    device TEXT,
    fs_type TEXT,
    size_kb BIGINT,
    used_kb BIGINT,
    avail_kb BIGINT,
    use_pct INTEGER,
    last_checked TEXT,
    UNIQUE(host_id, mount)
);
CREATE INDEX IF NOT EXISTS idx_host_filesystems_host ON host_filesystems(host_id);
"""


def _execute_schema(conn):
    for statement in SCHEMA.split(";"):
        statement = statement.strip()
        if statement:
            conn.execute(statement)


def init_db():
    conn = get_connection()
    _execute_schema(conn)

    # Migrations for existing databases
    conn.execute("ALTER TABLE execution_options ADD COLUMN IF NOT EXISTS branch TEXT")
    conn.execute("ALTER TABLE inventory_sources ADD COLUMN IF NOT EXISTS playbook_pattern TEXT NOT NULL DEFAULT 'ansible_scripts/*.yml'")
    conn.execute("ALTER TABLE templates ADD COLUMN IF NOT EXISTS inventory_source_id INTEGER REFERENCES inventory_sources(id) ON DELETE CASCADE")
    conn.commit()

    # Seed host groups
    if not conn.execute("SELECT COUNT(*) AS c FROM host_groups").fetchone()["c"]:
        for name in ("Production", "Staging", "Development"):
            conn.execute("INSERT INTO host_groups (name) VALUES (%s)", (name,))
        conn.commit()

    # Seed admin user (idempotent: create if missing, promote if exists but not admin)
    row = conn.execute("SELECT id, is_admin FROM users WHERE username = %s", (config.SEED_ADMIN_USER,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO users (username, email, password_hash, is_admin, is_active, created_at) VALUES (%s, %s, %s, 1, 1, %s)",
            (config.SEED_ADMIN_USER, "admin@gpta.local", hash_password(config.SEED_ADMIN_PASSWORD),
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    elif not row["is_admin"]:
        conn.execute("UPDATE users SET is_admin = 1 WHERE id = %s", (row["id"],))
        conn.commit()

    # Seed critical services catalog
    if not conn.execute("SELECT COUNT(*) AS c FROM critical_services").fetchone()["c"]:
        now_iso = datetime.now(timezone.utc).isoformat()
        for name in ("sshd", "systemd-journald", "chronyd", "firewalld",
                     "NetworkManager", "crond", "rsyslog", "dnf-automatic"):
            conn.execute(
                "INSERT INTO critical_services (name, created_at) VALUES (%s, %s) "
                "ON CONFLICT (name) DO NOTHING",
                (name, now_iso),
            )
        conn.commit()

    # Seed an execution option from env so existing installs keep working out of the box
    if not conn.execute("SELECT COUNT(*) AS c FROM execution_options").fetchone()["c"]:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO execution_options (name, provider, url, auth_mode, username, password, token, is_active, created_at, updated_at) "
            "VALUES (%s, 'awx', %s, %s, %s, %s, %s, 1, %s, %s)",
            ("Default AWX", f"{config.AWX_PROTOCOL}://{config.AWX_HOST}:{config.AWX_PORT}",
             config.AWX_AUTH_MODE, config.AWX_USERNAME, config.AWX_PASSWORD, config.AWX_TOKEN, now, now),
        )
        conn.commit()

    # Seed Local Runner option if not present
    local_opt = conn.execute("SELECT id FROM execution_options WHERE provider = 'local'").fetchone()
    if local_opt is None:
        now = datetime.now(timezone.utc).isoformat()
        has_active = conn.execute("SELECT id FROM execution_options WHERE is_active = 1").fetchone() is not None
        conn.execute(
            "INSERT INTO execution_options (name, provider, url, branch, auth_mode, is_active, created_at, updated_at) "
            "VALUES (%s, 'local', '', 'main', 'basic', %s, %s, %s)",
            ("Local Runner", 0 if has_active else 1, now, now),
        )
        conn.commit()

    conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def create_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=config.SESSION_TTL_DAYS)
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
        (token, user_id, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    return token


def get_user_by_session(token: str):
    if not token:
        return None
    conn = get_connection()
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
        (token, datetime.now(timezone.utc).isoformat()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token: str):
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = %s", (token,))
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()