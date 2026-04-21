from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx
from datetime import datetime
import os
import time
from pymongo import UpdateOne
from utils.audit import log_api_failure, log_fallback, log_performance

from routes.intervals import (
    SUPPORTED_INTERVALS,
    TWELVE_DATA_INTERVAL_MAP,
    normalize_interval,
    normalize_timestamp,
)

router = APIRouter()

# Set from main.py
db: AsyncIOMotorDatabase | None = None

TWELVE_DATA_BASE_URL = "https://api.twelvedata.com/time_series"


@router.get("/api/candles")
async def get_candles(
    pair: str = Query(..., example="EUR/USD"),
    interval: str = Query("daily", example="daily"),
):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    normalized_interval = normalize_interval(interval)
    if normalized_interval is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    collection = db["candles"]
    td_interval = TWELVE_DATA_INTERVAL_MAP[normalized_interval]

    # Fresh data check in MongoDB
    latest = await collection.find_one(
        {"pair": pair, "interval": normalized_interval},
        sort=[("fetched_at", -1)],
    )

    if latest and latest.get("fetched_at"):
        age = (datetime.utcnow() - latest["fetched_at"]).total_seconds()
        if age < 3600:  # less than 1 hour old
            cursor = collection.find(
                {"pair": pair, "interval": normalized_interval},
                {"_id": 0, "pair": 0, "interval": 0, "fetched_at": 0},
            ).sort("timestamp", -1)
            candles = await cursor.to_list(length=5000)
            candles.reverse()

            # If the data is fresh we return cached candle data
            await log_fallback(db, "candle_cache_hit", {"pair": pair, "interval": normalized_interval})
            # Convert string prices back to floats for the frontend
            for c in candles:
                c["open"] = float(c["open"])
                c["high"] = float(c["high"])
                c["low"] = float(c["low"])
                c["close"] = float(c["close"])
            return {
                "source": "cache",
                "count": len(candles),
                "pair": pair,
                "interval": normalized_interval,
                "candles": candles,
            }

    # Fetch from Twelve Data
    api_key = os.getenv("TWELVE_DATA_API_KEY")
    
    # Request parameters
    params = { 
        "symbol": pair,
        "interval": td_interval,
        "outputsize": 5000,
        "apikey": api_key,
    }

    # Making the request to Twelve Data
    async with httpx.AsyncClient() as client:
        response = await client.get(TWELVE_DATA_BASE_URL, params=params)
        data = response.json()

    # Error handling if there's no response we send a 502
    if "values" not in data:
        await log_api_failure(db, "twelvedata", "Missing 'values' in response", {"pair": pair, "response": data})
        raise HTTPException(status_code=502, detail={"error": "Failed to fetch data", "provider": data})

    # Parse and store in MongoDB
    now = datetime.utcnow()
    ops = []
    for item in data["values"]:
        # Creating the candle document following its json structure
        ts = normalize_timestamp(item["datetime"], normalized_interval)
        candle_doc = {
            "pair": pair,
            "interval": normalized_interval,
            "timestamp": ts,
            "open": item["open"],
            "high": item["high"],
            "low": item["low"],
            "close": item["close"],
            "fetched_at": now,
        }
        ops.append(
            UpdateOne(
                {
                    "pair": pair,
                    "interval": normalized_interval,
                    "timestamp": ts,
                },
                {"$set": candle_doc},
                upsert=True,
            )
        )

    if ops:
        await collection.bulk_write(ops, ordered=False)

    # Clean up any stale candles with un-normalized timestamps that may
    # linger from before timestamp normalization was introduced.
    normalized_timestamps = {normalize_timestamp(item["datetime"], normalized_interval) for item in data["values"]}
    stale_result = await collection.delete_many({
        "pair": pair,
        "interval": normalized_interval,
        "timestamp": {"$nin": list(normalized_timestamps)},
    })
    if stale_result.deleted_count > 0:
        print(f"[candles] Cleaned {stale_result.deleted_count} stale {normalized_interval} candles for {pair}")

    # Return the stored data
    cursor = collection.find(
        {"pair": pair, "interval": normalized_interval},
        {"_id": 0, "pair": 0, "interval": 0, "fetched_at": 0},
    ).sort("timestamp", -1)
    candles = await cursor.to_list(length=5000)
    candles.reverse()

    # Convert string prices back to floats for the frontend
    for c in candles:
        c["open"] = float(c["open"])
        c["high"] = float(c["high"])
        c["low"] = float(c["low"])
        c["close"] = float(c["close"])

    return {
        "source": "api",
        "count": len(candles),
        "pair": pair,
        "interval": normalized_interval,
        "candles": candles,
    }
