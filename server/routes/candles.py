from fastapi import APIRouter, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx
from datetime import datetime, timezone
import os

router = APIRouter()

# Set from main.py
db: AsyncIOMotorDatabase = None

TWELVE_DATA_BASE_URL = "https://api.twelvedata.com/time_series"

# Mapping interval names to Twelve Data's format
INTERVAL_MAP = {
    "daily": "1day",
    "1h": "1h",
    "4h": "4h",
    "weekly": "1week",
}


@router.get("/api/candles")
async def get_candles(
    pair: str = Query(..., example="EUR/USD"),
    interval: str = Query("daily", example="daily"),
):
    if db is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Database not initialized")

    collection = db["candles"]
    td_interval = INTERVAL_MAP.get(interval, "1day")

    # Fresh data check in MongoDB
    latest = await collection.find_one(
        {"pair": pair, "interval": interval},
        sort=[("fetched_at", -1)],
    )

    if latest and latest.get("fetched_at"):
        age = (datetime.utcnow() - latest["fetched_at"]).total_seconds()
        if age < 3600:  # less than 1 hour old
            cursor = collection.find(
                {"pair": pair, "interval": interval},
                {"_id": 0, "pair": 0, "interval": 0, "fetched_at": 0},
            ).sort("timestamp", 1)
            candles = await cursor.to_list(length=5000)
            return {"source": "cache", "count": len(candles), "candles": candles}

    # Fetch from Twelve Data
    api_key = os.getenv("TWELVE_DATA_API_KEY")
    params = {
        "symbol": pair,
        "interval": td_interval,
        "outputsize": 500,
        "apikey": api_key,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(TWELVE_DATA_BASE_URL, params=params)
        data = response.json()

    if "values" not in data:
        return {"error": "Failed to fetch data", "detail": data}

    # Parse and store in MongoDB
    now = datetime.utcnow()

    for item in data["values"]:
        candle_doc = {
            "pair": pair,
            "interval": interval,
            "timestamp": item["datetime"],
            "open": float(item["open"]),
            "high": float(item["high"]),
            "low": float(item["low"]),
            "close": float(item["close"]),
            "fetched_at": now,
        }

        await collection.update_one(
            {
                "pair": pair,
                "interval": interval,
                "timestamp": item["datetime"],
            },
            {"$set": candle_doc},
            upsert=True,
        )

    # Return the stored data
    cursor = collection.find(
        {"pair": pair, "interval": interval},
        {"_id": 0, "pair": 0, "interval": 0, "fetched_at": 0},
    ).sort("timestamp", 1)
    candles = await cursor.to_list(length=5000)

    return {"source": "api", "count": len(candles), "candles": candles}