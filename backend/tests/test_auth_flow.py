"""Integration tests for the auth flow (requires gpta_test Postgres)."""
import pytest

from .conftest import ADMIN_PASSWORD, ADMIN_USER, make_user

pytestmark = pytest.mark.integration


def test_login_success(client):
    res = client.post("/api/v1/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["user"]["username"] == ADMIN_USER
    assert body["user"]["is_admin"] == 1
    assert "password_hash" not in body["user"]


def test_login_wrong_password(client):
    res = client.post("/api/v1/auth/login", json={"username": ADMIN_USER, "password": "nope"})
    assert res.status_code == 401


def test_login_unknown_user(client):
    res = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "x"})
    assert res.status_code == 401


def test_profile_with_session(client, login):
    res = client.get("/api/v1/auth/profile")
    assert res.status_code == 200
    assert res.json()["user"]["username"] == ADMIN_USER


def test_profile_without_session(client):
    res = client.get("/api/v1/auth/profile")
    assert res.status_code == 401


def test_logout_invalidates_session(client, login):
    res = client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert client.get("/api/v1/auth/profile").status_code == 401


def test_change_password_roundtrip(client, login):
    res = client.post("/api/v1/auth/change-password",
                      json={"old_password": ADMIN_PASSWORD, "new_password": "Bogdan456!"})
    assert res.status_code == 200

    # Old password rejected, new one accepted
    assert client.post("/api/v1/auth/login",
                       json={"username": ADMIN_USER, "password": ADMIN_PASSWORD}).status_code == 401
    res = client.post("/api/v1/auth/login",
                      json={"username": ADMIN_USER, "password": "Bogdan456!"})
    assert res.status_code == 200

    # Restore the seed password so other tests keep working
    client.post("/api/v1/auth/change-password",
                json={"old_password": "Bogdan456!", "new_password": ADMIN_PASSWORD})
    assert client.post("/api/v1/auth/login",
                       json={"username": ADMIN_USER, "password": ADMIN_PASSWORD}).status_code == 200


def test_change_password_wrong_current(client, login):
    res = client.post("/api/v1/auth/change-password",
                      json={"old_password": "wrong", "new_password": "Whatever1!"})
    assert res.status_code == 400


def test_viewer_cannot_list_users(client, viewer):
    res = client.get("/api/v1/users")
    assert res.status_code == 403


def test_admin_can_list_users(client, login):
    make_user(client, "viewer1")
    res = client.get("/api/v1/users")
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()["users"]}
    assert "viewer1" in usernames


def test_create_user_requires_admin(client, viewer):
    res = client.post("/api/v1/users", json={"username": "hacker", "password": "password123"})
    assert res.status_code == 403


def test_create_duplicate_user_409(client, login):
    make_user(client, "dupuser")
    res = client.post("/api/v1/users", json={"username": "dupuser", "password": "password123"})
    assert res.status_code == 409
