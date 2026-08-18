"""Shared pytest fixtures for the GPTA backend.

Env is configured BEFORE any `app.*` import so `config` picks up test dirs and
the dedicated test database (`gpta_test`). Integration tests that need a real
Postgres (`client` fixture) auto-skip when it is unreachable, so the unit tests
run anywhere.
"""
import os
import pathlib
import tempfile

_TMP = pathlib.Path(tempfile.mkdtemp(prefix="gpta-test-"))
os.environ.setdefault("DATA_DIR", str(_TMP / "data"))
os.environ.setdefault("RUNS_DIR", str(_TMP / "runs"))
os.environ.setdefault("USER_FILES_PATH", str(_TMP / "user_files"))
os.environ.setdefault("AWX_MASTER_VAULT", str(_TMP / "vault"))
os.environ.setdefault("DATABASE_NAME", "gpta_test")
os.environ.setdefault("DATABASE_USER", "gpta")
os.environ.setdefault("DATABASE_PASSWORD", "gpta")
os.environ.setdefault("DATABASE_HOST", "localhost")
os.environ.setdefault("DATABASE_PORT", "5432")

import pytest

_DB_AVAILABLE = None


def db_available() -> bool:
    global _DB_AVAILABLE
    if _DB_AVAILABLE is None:
        try:
            from app import database
            conn = database.get_connection()
            conn.execute("SELECT 1").fetchone()
            conn.close()
            _DB_AVAILABLE = True
        except Exception:
            _DB_AVAILABLE = False
    return _DB_AVAILABLE


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: requires a reachable gpta_test Postgres database",
    )


@pytest.fixture(scope="session")
def client():
    """FastAPI TestClient against the real app, only when Postgres is up.

    `start_scheduler` is replaced with a no-op so tests don't spawn background
    threads; `init_db` runs (idempotent) so schema + seeded admin exist.
    """
    if not db_available():
        pytest.skip("integration: gpta_test Postgres not reachable "
                    "(start the docker compose db and create a gpta_test database)")
    import app.scheduler
    app.scheduler.start_scheduler = lambda: None

    from fastapi.testclient import TestClient

    from app import database
    from app.main import app

    database.init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_tables():
    """Best-effort table wipe between tests so integration tests are isolated."""
    yield
    if not db_available():
        return
    from app import database
    conn = database.get_connection()
    try:
        conn.execute(
            "TRUNCATE sessions, patch_runs, policy_exclusions, policy_assignments, patch_policies, "
            "host_packages, host_services, host_filesystems, button_bindings, templates, "
            "inventory_sources, execution_environments, credentials, hosts, host_groups, "
            "execution_options RESTART IDENTITY CASCADE"
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


ADMIN_USER = os.getenv("SEED_ADMIN_USER", "test")
ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "Bogdan123!")


@pytest.fixture
def login(client):
    """Log in as the seeded admin; returns the user dict."""
    res = client.post("/api/v1/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["user"]


def make_user(client, username, password="password123", is_admin=False):
    res = client.post("/api/v1/users", json={
        "username": username, "password": password, "email": f"{username}@test.local", "is_admin": is_admin,
    })
    assert res.status_code == 200, res.text
    return res.json()["user"]


@pytest.fixture
def viewer(client):
    """Create + log in as a non-admin user."""
    make_user(client, "viewer1")
    res = client.post("/api/v1/auth/login", json={"username": "viewer1", "password": "password123"})
    assert res.status_code == 200, res.text
    return res.json()["user"]
