"""
Integration tests for routes/snapshots.py (save / list / update / delete).

Verifies that:
  - Every endpoint requires authentication.
  - A user can only see/modify/delete their own snapshots (scoping by user_id).
  - Invalid ObjectIds are rejected with 422.
  - PATCH with no fields returns 422.
  - List filtering by pair works and default sort is saved_at descending.
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
from routes import snapshots as snapshots_module  # noqa: E402


# ── Minimal async cursor + collection fakes ──────────────────────────────────


class _FakeCursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs

    def sort(self, key: str, direction: int):
        self._docs = sorted(
            self._docs, key=lambda d: d.get(key, ""), reverse=(direction == -1)
        )
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length: int):
        return list(self._docs[:length])


class _FakeInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class _FakeUpdateResult:
    def __init__(self, matched: int):
        self.matched_count = matched


class _FakeDeleteResult:
    def __init__(self, deleted: int):
        self.deleted_count = deleted


class FakeSnapshotsCollection:
    def __init__(self):
        self._docs: list[dict] = []

    async def insert_one(self, doc: dict):
        new_doc = dict(doc)
        new_doc["_id"] = ObjectId()
        self._docs.append(new_doc)
        return _FakeInsertResult(new_doc["_id"])

    def find(self, filt: dict, projection: dict | None = None):
        matches = [d for d in self._docs if all(d.get(k) == v for k, v in filt.items())]
        if projection:
            keys = {k for k, v in projection.items() if v}
            matches = [{k: v for k, v in d.items() if k in keys or k == "_id"} for d in matches]
        return _FakeCursor(matches)

    async def update_one(self, filt: dict, update: dict):
        for d in self._docs:
            if all(d.get(k) == v for k, v in filt.items()):
                d.update(update.get("$set", {}))
                return _FakeUpdateResult(1)
        return _FakeUpdateResult(0)

    async def delete_one(self, filt: dict):
        for i, d in enumerate(self._docs):
            if all(d.get(k) == v for k, v in filt.items()):
                self._docs.pop(i)
                return _FakeDeleteResult(1)
        return _FakeDeleteResult(0)


class FakeUsersCollection:
    def __init__(self):
        self._docs: list[dict] = []

    async def find_one(self, query, projection=None):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    async def insert_one(self, doc):
        new_doc = dict(doc)
        new_doc["_id"] = ObjectId()
        self._docs.append(new_doc)
        return _FakeInsertResult(new_doc["_id"])


class FakeDb:
    def __init__(self):
        self._collections = {
            "users": FakeUsersCollection(),
            "snapshots": FakeSnapshotsCollection(),
        }

    def __getitem__(self, name: str):
        return self._collections[name]


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def app_setup():
    fake_db = FakeDb()
    auth_module.db = fake_db
    snapshots_module.db = fake_db
    app = FastAPI()
    app.include_router(auth_module.router)
    app.include_router(snapshots_module.router)
    try:
        with TestClient(app) as c:
            yield c, fake_db
    finally:
        auth_module.db = None
        snapshots_module.db = None


def _register(client, email: str, name: str = "User"):
    resp = client.post(
        "/api/auth/register",
        json={"email": email, "password": "hunter22", "display_name": name},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["token"], body["user"]["id"]


def _snapshot_payload(**overrides) -> dict:
    base = {
        "pair": "EUR/USD",
        "interval": "1h",
        "selection_start": "2024-01-01 00:00:00",
        "selection_end": "2024-01-01 06:00:00",
    }
    base.update(overrides)
    return base


# ── Auth required on every endpoint ──────────────────────────────────────────


def test_all_endpoints_require_auth(app_setup):
    client, _ = app_setup
    assert client.post("/api/snapshots", json=_snapshot_payload()).status_code == 401
    assert client.get("/api/snapshots").status_code == 401
    assert client.patch("/api/snapshots/abc", json={"note": "x"}).status_code == 401
    assert client.delete("/api/snapshots/abc").status_code == 401


# ── POST /api/snapshots ──────────────────────────────────────────────────────


def test_save_snapshot_stores_user_id_and_returns_id(app_setup):
    client, db = app_setup
    token, user_id = _register(client, "a@e.com")

    resp = client.post(
        "/api/snapshots",
        json=_snapshot_payload(note="entry at FVG"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"]

    # Persisted doc carries the user_id from the JWT.
    stored = db["snapshots"]._docs[0]
    assert stored["user_id"] == user_id
    assert stored["note"] == "entry at FVG"
    assert "saved_at" in stored


# ── GET /api/snapshots ───────────────────────────────────────────────────────


def test_list_only_returns_current_users_snapshots(app_setup):
    client, _ = app_setup
    token_a, _ = _register(client, "a@e.com", name="A")
    token_b, _ = _register(client, "b@e.com", name="B")

    client.post(
        "/api/snapshots",
        json=_snapshot_payload(note="a-snap"),
        headers={"Authorization": f"Bearer {token_a}"},
    )
    client.post(
        "/api/snapshots",
        json=_snapshot_payload(note="b-snap"),
        headers={"Authorization": f"Bearer {token_b}"},
    )

    a_list = client.get(
        "/api/snapshots", headers={"Authorization": f"Bearer {token_a}"}
    ).json()
    b_list = client.get(
        "/api/snapshots", headers={"Authorization": f"Bearer {token_b}"}
    ).json()

    assert len(a_list) == 1 and a_list[0]["note"] == "a-snap"
    assert len(b_list) == 1 and b_list[0]["note"] == "b-snap"


def test_list_filters_by_pair(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    for pair in ["EUR/USD", "GBP/USD", "EUR/USD"]:
        client.post(
            "/api/snapshots",
            json=_snapshot_payload(pair=pair),
            headers={"Authorization": f"Bearer {token}"},
        )
    resp = client.get(
        "/api/snapshots?pair=EUR/USD",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    assert all(s["pair"] == "EUR/USD" for s in items)


def test_list_sorted_by_saved_at_desc(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    for _ in range(3):
        client.post(
            "/api/snapshots",
            json=_snapshot_payload(),
            headers={"Authorization": f"Bearer {token}"},
        )
    items = client.get(
        "/api/snapshots", headers={"Authorization": f"Bearer {token}"}
    ).json()
    saved_ats = [s["saved_at"] for s in items]
    assert saved_ats == sorted(saved_ats, reverse=True)


# ── PATCH /api/snapshots/{id} ────────────────────────────────────────────────


def test_patch_updates_note_and_outcome(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    saved = client.post(
        "/api/snapshots",
        json=_snapshot_payload(),
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    resp = client.patch(
        f"/api/snapshots/{saved['id']}",
        json={"outcome": "win", "note": "great entry"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"updated": True}


def test_patch_rejects_invalid_object_id(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    resp = client.patch(
        "/api/snapshots/not-an-oid",
        json={"outcome": "win"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_patch_rejects_empty_body(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    saved = client.post(
        "/api/snapshots",
        json=_snapshot_payload(),
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    resp = client.patch(
        f"/api/snapshots/{saved['id']}",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_patch_cannot_modify_other_users_snapshot(app_setup):
    """User B tries to patch User A's snapshot → 404 (treated as not found)."""
    client, _ = app_setup
    token_a, _ = _register(client, "a@e.com")
    token_b, _ = _register(client, "b@e.com")
    saved = client.post(
        "/api/snapshots",
        json=_snapshot_payload(),
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    resp = client.patch(
        f"/api/snapshots/{saved['id']}",
        json={"outcome": "loss"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


# ── DELETE /api/snapshots/{id} ───────────────────────────────────────────────


def test_delete_removes_own_snapshot(app_setup):
    client, db = app_setup
    token, _ = _register(client, "a@e.com")
    saved = client.post(
        "/api/snapshots",
        json=_snapshot_payload(),
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    resp = client.delete(
        f"/api/snapshots/{saved['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert db["snapshots"]._docs == []


def test_delete_rejects_invalid_object_id(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    resp = client.delete(
        "/api/snapshots/not-an-oid",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_delete_cannot_remove_other_users_snapshot(app_setup):
    client, db = app_setup
    token_a, _ = _register(client, "a@e.com")
    token_b, _ = _register(client, "b@e.com")
    saved = client.post(
        "/api/snapshots",
        json=_snapshot_payload(),
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    resp = client.delete(
        f"/api/snapshots/{saved['id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404
    # Snapshot still exists — user B's delete must not have succeeded.
    assert len(db["snapshots"]._docs) == 1


def test_delete_returns_404_for_missing_snapshot(app_setup):
    client, _ = app_setup
    token, _ = _register(client, "a@e.com")
    resp = client.delete(
        f"/api/snapshots/{ObjectId()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
