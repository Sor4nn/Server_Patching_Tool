import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from . import config


def get_connection():
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    version TEXT,
    release TEXT,
    arch TEXT,
    epoch TEXT,
    source TEXT,
    installed_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(host_id, name, version, release, arch)
);
CREATE INDEX IF NOT EXISTS idx_host_packages_host ON host_packages(host_id);

CREATE TABLE IF NOT EXISTS patch_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER NOT NULL REFERENCES patch_policies(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,  -- host | host_group
    target_id INTEGER NOT NULL,
    UNIQUE(policy_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS policy_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER NOT NULL REFERENCES patch_policies(id) ON DELETE CASCADE,
    host_id INTEGER NOT NULL,
    UNIQUE(policy_id, host_id)
);

CREATE TABLE IF NOT EXISTS execution_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'awx',  -- awx | jenkins (future)
    url TEXT NOT NULL,
    auth_mode TEXT NOT NULL DEFAULT 'basic',  -- basic | token
    username TEXT,
    password TEXT,
    token TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

# Columns added to existing tables on upgrade (sqlite lacks ADD COLUMN IF NOT EXISTS)
UPGRADE_COLUMNS = {
    "host_packages": [
        ("available_version", "TEXT"),
        ("needs_update", "INTEGER NOT NULL DEFAULT 0"),
        ("is_security_update", "INTEGER NOT NULL DEFAULT 0"),
        ("category", "TEXT"),
    ],
}


def _has_column(conn, table: str, column: str) -> bool:
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    return column in cols


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)
    for table, cols in UPGRADE_COLUMNS.items():
        for col, ddl in cols:
            if not _has_column(conn, table, col):
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
    conn.commit()

    # Seed host groups
    if not conn.execute("SELECT COUNT(*) AS c FROM host_groups").fetchone()["c"]:
        for name in ("Production", "Staging", "Development"):
            conn.execute("INSERT INTO host_groups (name) VALUES (?)", (name,))
        conn.commit()

    # Seed admin user
    row = conn.execute("SELECT id FROM users WHERE username = ?", (config.SEED_ADMIN_USER,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO users (username, email, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, 1, 1, ?)",
            (config.SEED_ADMIN_USER, "admin@gpta.local", hash_password(config.SEED_ADMIN_PASSWORD),
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()

    # Seed an execution option from env so existing installs keep working out of the box
    if not conn.execute("SELECT COUNT(*) AS c FROM execution_options").fetchone()["c"]:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO execution_options (name, provider, url, auth_mode, username, password, token, is_active, created_at, updated_at) "
            "VALUES (?, 'awx', ?, ?, ?, ?, ?, 1, ?, ?)",
            ("Default AWX", f"{config.AWX_PROTOCOL}://{config.AWX_HOST}:{config.AWX_PORT}",
             config.AWX_AUTH_MODE, config.AWX_USERNAME, config.AWX_PASSWORD, config.AWX_TOKEN, now, now),
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
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    return token


def get_user_by_session(token: str):
    if not token:
        return None
    conn = get_connection()
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
        (token, datetime.now(timezone.utc).isoformat()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token: str):
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
