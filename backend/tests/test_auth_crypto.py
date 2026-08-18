"""Unit tests for password hashing (no DB)."""
from app import database


def test_hash_verify_roundtrip():
    hashed = database.hash_password("s3cret!")
    assert hashed.startswith("pbkdf2_sha256$")
    assert database.verify_password("s3cret!", hashed) is True


def test_verify_wrong_password():
    hashed = database.hash_password("right")
    assert database.verify_password("wrong", hashed) is False


def test_verify_malformed_hash():
    assert database.verify_password("x", "not-a-hash") is False
    assert database.verify_password("x", "") is False


def test_hashes_are_salted():
    assert database.hash_password("same") != database.hash_password("same")


def test_now_iso_is_utc_isoformat():
    import datetime
    parsed = datetime.datetime.fromisoformat(database.now_iso())
    assert parsed.tzinfo is not None
