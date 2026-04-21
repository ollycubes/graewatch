from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

router = APIRouter()

db: AsyncIOMotorDatabase | None = None


class SnapshotPayload(BaseModel):
    pair: str
    interval: str
    selection_start: str
    selection_end: str
    bias: str | None = None
    entry_top: float | None = None
    entry_bottom: float | None = None
    entry_type: str | None = None
    target: float | None = None
    target_type: str | None = None
    stop: float | None = None
    risk_reward: float | None = None
    note: str | None = None
    screenshot: str | None = None  # base64 PNG data URL


@router.post("/api/snapshots", status_code=201)
async def save_snapshot(payload: SnapshotPayload):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    doc = {
        **payload.model_dump(),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db["snapshots"].insert_one(doc)
    return {"id": str(result.inserted_id)}


@router.get("/api/snapshots")
async def list_snapshots(pair: str | None = None, limit: int = 50):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    filt: dict = {}
    if pair:
        filt["pair"] = pair

    cursor = db["snapshots"].find(filt, {"_id": 1, "pair": 1, "interval": 1,
        "selection_start": 1, "selection_end": 1, "bias": 1,
        "entry_top": 1, "entry_bottom": 1, "entry_type": 1,
        "target": 1, "target_type": 1, "stop": 1, "risk_reward": 1,
        "note": 1, "outcome": 1, "saved_at": 1, "screenshot": 1,
    }).sort("saved_at", -1).limit(limit)

    docs = await cursor.to_list(length=limit)
    for doc in docs:
        doc["id"] = str(doc.pop("_id"))
    return docs


class SnapshotPatch(BaseModel):
    outcome: str | None = None   # "win" | "loss" | "breakeven" | "pending"
    note: str | None = None


@router.patch("/api/snapshots/{snapshot_id}")
async def update_snapshot(snapshot_id: str, payload: SnapshotPatch):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    from bson import ObjectId
    try:
        oid = ObjectId(snapshot_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid snapshot id")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")

    result = await db["snapshots"].update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"updated": True}


@router.delete("/api/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    from bson import ObjectId
    try:
        oid = ObjectId(snapshot_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid snapshot id")

    result = await db["snapshots"].delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"deleted": True}
