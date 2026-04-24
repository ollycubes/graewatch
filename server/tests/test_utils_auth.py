"""
Unit tests for utils/auth.py — password hashing and JWT helpers.

These tests do not touch the database or FastAPI. They verify the primitives
that secure the whole authentication flow: bcrypt round-trips, JWT signing,
expiry, and tamper-detection.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from jose import JWTError, jwt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Ensure a JWT secret exists before utils.auth's helpers are called.
os.environ.setdefault("JWT_SECRET", "test-secret-value-for-unit-tests")

from utils.auth import (  # noqa: E402
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


# ── hash_password / verify_password ──────────────────────────────────────────


def test_hash_password_is_not_plaintext():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert hashed.startswith("$2")  # bcrypt identifier


def test_hash_password_produces_unique_salts():
    """Two hashes of the same password must differ (random salt per call)."""
    a = hash_password("same-password")
    b = hash_password("same-password")
    assert a != b


def test_verify_password_accepts_correct_password():
    hashed = hash_password("s3cret-pw")
    assert verify_password("s3cret-pw", hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("s3cret-pw")
    assert verify_password("wrong-pw", hashed) is False


def test_verify_password_rejects_empty_password_against_real_hash():
    hashed = hash_password("non-empty")
    assert verify_password("", hashed) is False


def test_hash_and_verify_handles_unicode():
    pw = "pässwörd-🔐-123"
    hashed = hash_password(pw)
    assert verify_password(pw, hashed) is True
    assert verify_password("passwörd-🔐-123", hashed) is False


# ── create_access_token / decode_access_token ────────────────────────────────


def test_create_access_token_returns_decodable_jwt():
    token = create_access_token("user-abc", "user@example.com")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-abc"
    assert payload["email"] == "user@example.com"
    assert "exp" in payload


def test_create_access_token_sets_future_expiry():
    token = create_access_token("u", "u@e.com")
    payload = decode_access_token(token)
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    now = datetime.now(timezone.utc)
    # Expiry must be in the future and within 8 days (config says 7).
    assert exp > now
    assert exp < now + timedelta(days=8)


def test_decode_access_token_rejects_tampered_token():
    token = create_access_token("u", "u@e.com")
    # Flip a character in the signature segment to invalidate it.
    header, body, sig = token.split(".")
    tampered_sig = "A" + sig[1:] if sig[0] != "A" else "B" + sig[1:]
    bad = f"{header}.{body}.{tampered_sig}"
    with pytest.raises(JWTError):
        decode_access_token(bad)


def test_decode_access_token_rejects_expired_token():
    """A token whose exp is in the past must raise JWTError."""
    secret = os.environ["JWT_SECRET"]
    expired = jwt.encode(
        {
            "sub": "u",
            "email": "u@e.com",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        secret,
        algorithm=ALGORITHM,
    )
    with pytest.raises(JWTError):
        decode_access_token(expired)


def test_decode_access_token_rejects_wrong_secret():
    foreign = jwt.encode(
        {
            "sub": "u",
            "email": "u@e.com",
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
        },
        "some-other-secret",
        algorithm=ALGORITHM,
    )
    with pytest.raises(JWTError):
        decode_access_token(foreign)
