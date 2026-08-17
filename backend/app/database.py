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
"""


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


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)
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
    conn.close()


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
