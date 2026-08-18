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
    cves TEXT,
    UNIQUE(host_id, name, version, release, arch)
);
CREATE INDEX IF NOT EXISTS idx_host_packages_host ON host_packages(host_id);

CREATE TABLE IF NOT EXISTS package_snapshots (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    captured_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'report',   -- baseline | report
    name TEXT NOT NULL,
    version TEXT,
    release TEXT,
    arch TEXT,
    epoch TEXT,
    available_version TEXT,
    needs_update INTEGER NOT NULL DEFAULT 0,
    is_security_update INTEGER NOT NULL DEFAULT 0,
    cves TEXT
);
CREATE INDEX IF NOT EXISTS idx_pkg_snap_host_time ON package_snapshots(host_id, captured_at);

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
    description TEXT,
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


def capture_package_snapshot(conn, host_id: int, kind: str = "report") -> bool:
    """Persist a compact history snapshot of a host's package state.

    A snapshot is written only when the installed set or any pending-update
    flag changed since the last snapshot (baseline when none exists yet), so
    history records material changes like git commits rather than identical
    reports.
    """
    current = conn.execute(
        "SELECT name, version, release, arch, epoch, available_version, needs_update, is_security_update, cves "
        "FROM host_packages WHERE host_id = %s ORDER BY name", (host_id,)).fetchall()
    last = conn.execute(
        "SELECT name, version, release, arch, epoch, available_version, needs_update, is_security_update, cves "
        "FROM package_snapshots WHERE host_id = %s "
        "AND captured_at = (SELECT MAX(captured_at) FROM package_snapshots WHERE host_id = %s)",
        (host_id, host_id)).fetchall()

    def _insert(snapshot_kind: str, now: str):
        for p in current:
            conn.execute(
                "INSERT INTO package_snapshots (host_id, captured_at, kind, name, version, release, arch, epoch, "
                "available_version, needs_update, is_security_update, cves) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (host_id, now, snapshot_kind, p["name"], p["version"], p["release"], p["arch"], p["epoch"],
                 p["available_version"], p["needs_update"], p["is_security_update"], p["cves"]),
            )

    if not last:
        _insert("baseline", now_iso())
        return bool(current)

    last_key = {(r["name"], r["version"], r["release"], r["arch"], r["needs_update"], r["is_security_update"])
                for r in last}
    cur_key = {(r["name"], r["version"], r["release"], r["arch"], r["needs_update"], r["is_security_update"])
               for r in current}
    if last_key == cur_key:
        return False
    _insert(kind, now_iso())
    return True


def init_db():
    conn = get_connection()
    _execute_schema(conn)

    # Migrations for existing databases
    conn.execute("ALTER TABLE execution_options ADD COLUMN IF NOT EXISTS branch TEXT")
    conn.execute("ALTER TABLE inventory_sources ADD COLUMN IF NOT EXISTS description TEXT")
    conn.execute("ALTER TABLE inventory_sources ADD COLUMN IF NOT EXISTS playbook_pattern TEXT NOT NULL DEFAULT 'ansible_scripts/*.yml'")
    conn.execute("ALTER TABLE templates ADD COLUMN IF NOT EXISTS inventory_source_id INTEGER REFERENCES inventory_sources(id) ON DELETE CASCADE")
    conn.execute("ALTER TABLE host_packages ADD COLUMN IF NOT EXISTS cves TEXT")
    conn.execute("ALTER TABLE patch_runs ADD COLUMN IF NOT EXISTS output TEXT")

    # Normalize legacy raw RPM install times (epoch seconds) stored as text.
    conn.execute(
        "UPDATE host_packages SET installed_at = "
        "to_char(to_timestamp(installed_at::bigint) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') "
        "WHERE installed_at ~ '^[0-9]+$' AND length(installed_at) <= 10 "
        "AND installed_at::bigint BETWEEN 315532800 AND 4102444800"
    )
    conn.commit()

    # Backfill package history baselines for hosts that have packages but no snapshot yet.
    for row in conn.execute(
        "SELECT h.id FROM hosts h "
        "WHERE EXISTS (SELECT 1 FROM host_packages hp WHERE hp.host_id = h.id) "
        "AND NOT EXISTS (SELECT 1 FROM package_snapshots ps WHERE ps.host_id = h.id)"
    ).fetchall():
        capture_package_snapshot(conn, row["id"])
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


def normalize_installed_at(value: str | None) -> str | None:
    """Convert an RPM install-time value to a UTC ISO timestamp.

    rpm reports install time as epoch seconds; store it as a readable timestamp
    instead of exposing the raw integer to the UI. ISO values pass through.
    """
    if value is None:
        return None
    v = str(value).strip()
    if not v or not v.isdigit():
        return v or None
    try:
        return datetime.fromtimestamp(int(v), timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None