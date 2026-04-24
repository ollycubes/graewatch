"""
Integration tests for routes/auth.py (/api/auth/register, /login, /me).

These tests use FastAPI's TestClient against a minimal app that mounts only the
auth router. The Mongo `users` collection is replaced with an in-memory fake so
tests run without a real database.
"""

import os
import sys

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("JWT_SECRET", "test-secret-value-for-unit-tests")

from routes import auth as auth_module  # noqa: E402


# ── Fake async Mongo collection & db ─────────────────────────────────────────


class _FakeInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class FakeUsersCollection:
    """Minimal async stand-in for motor's AsyncIOMotorCollection (users)."""

    def __init__(self):
        self._docs: list[dict] = []

    async def find_one(self, query: dict, projection: dict | None = None):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if projection:
                    # Respect a simple inclusion projection like {"_id":1, "email":1}
                    keys = {k for k, v in projection.items() if v}
                    return {k: v for k, v in doc.items() if k in keys}
                return dict(doc)
        return None

    async def insert_one(self, doc: dict):
        new_doc = dict(doc)
        new_doc["_id"] = ObjectId()
        self._docs.append(new_doc)
        return _FakeInsertResult(new_doc["_id"])


class FakeDb:
    def __init__(self):
        self._collections = {"users": FakeUsersCollection()}

    def __getitem__(self, name: str):
        return self._collections[name]


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    """A TestClient against an app that mounts only the auth router."""
    fake_db = FakeDb()
    auth_module.db = fake_db
    app = FastAPI()
    app.include_router(auth_module.router)
    try:
        with TestClient(app) as c:
            yield c
    finally:
        auth_module.db = None


def _register(client, email="user@example.com", password="hunter22", name="User One"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )


# ── /register ────────────────────────────────────────────────────────────────


def test_register_creates_user_and_returns_token(client):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert "token" in body and isinstance(body["token"], str)
    assert body["user"]["email"] == "user@example.com"
    assert body["user"]["display_name"] == "User One"
    assert body["user"]["id"]  # non-empty id


def test_register_rejects_short_password(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "u@e.com", "password": "abc", "display_name": "U"},
    )
    assert resp.status_code == 422


def test_register_rejects_invalid_email(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": "hunter22", "display_name": "U"},
    )
    # Pydantic EmailStr validation → 422 from FastAPI.
    assert resp.status_code == 422


def test_register_rejects_duplicate_email(client):
    _register(client)
    resp = _register(client)  # same email twice
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


def test_register_does_not_leak_password_hash(client):
    body = _register(client).json()
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]


# ── /login ───────────────────────────────────────────────────────────────────


def test_login_succeeds_with_correct_credentials(client):
    _register(client, email="me@e.com", password="hunter22", name="Me")
    resp = client.post(
        "/api/auth/login",
        json={"email": "me@e.com", "password": "hunter22"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == "me@e.com"
    assert body["token"]


def test_login_rejects_wrong_password(client):
    _register(client, email="me@e.com", password="hunter22")
    resp = client.post(
        "/api/auth/login",
        json={"email": "me@e.com", "password": "WRONG"},
    )
    assert resp.status_code == 401


def test_login_rejects_unknown_email(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "noone@e.com", "password": "hunter22"},
    )
    assert resp.status_code == 401


def test_login_error_messages_do_not_leak_user_existence(client):
    """Unknown email and wrong password must return identical error detail."""
    _register(client, email="me@e.com", password="hunter22")
    wrong_pw = client.post(
        "/api/auth/login",
        json={"email": "me@e.com", "password": "WRONG"},
    )
    unknown = client.post(
        "/api/auth/login",
        json={"email": "noone@e.com", "password": "hunter22"},
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


# ── /me ──────────────────────────────────────────────────────────────────────


def test_me_requires_authentication(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_rejects_invalid_token(client):
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401


def test_me_returns_profile_with_valid_token(client):
    token = _register(client, email="me@e.com", name="Me Display").json()["token"]
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "me@e.com"
    assert body["display_name"] == "Me Display"
    assert body["id"]


def test_me_returns_404_when_user_deleted(client):
    token = _register(client, email="me@e.com").json()["token"]
    # Wipe the users collection; token is still valid but user no longer exists.
    auth_module.db["users"]._docs.clear()
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
