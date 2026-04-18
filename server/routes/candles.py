from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx
from datetime import datetime
import os
from pymongo import UpdateOne

from routes.intervals import (
    SUPPORTED_INTERVALS,
    TWELVE_DATA_INTERVAL_MAP,
    normalize_interval,
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
        raise HTTPException(status_code=502, detail={"error": "Failed to fetch data", "provider": data})

    # Parse and store in MongoDB
    now = datetime.utcnow()
    ops = []
    for item in data["values"]:
        # Creating the candle document following its json structure
        candle_doc = {
            "pair": pair,
            "interval": normalized_interval,
            "timestamp": item["datetime"],
            "open": float(item["open"]),
            "high": float(item["high"]),
            "low": float(item["low"]),
            "close": float(item["close"]),
            "fetched_at": now,
        }
        ops.append(
            UpdateOne(
                {
                    "pair": pair,
                    "interval": normalized_interval,
                    "timestamp": item["datetime"],
                },
                {"$set": candle_doc},
                upsert=True,
            )
        )

    if ops:
        await collection.bulk_write(ops, ordered=False)

    # Return the stored data
    cursor = collection.find(
        {"pair": pair, "interval": normalized_interval},
        {"_id": 0, "pair": 0, "interval": 0, "fetched_at": 0},
    ).sort("timestamp", -1)
    candles = await cursor.to_list(length=5000)
    candles.reverse()

    return {
        "source": "api",
        "count": len(candles),
        "pair": pair,
        "interval": normalized_interval,
        "candles": candles,
    }
