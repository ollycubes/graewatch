from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS, simulate_candles
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase = None


@router.get("/api/simulate")
async def get_simulation(
    pair: str = Query(...),
    interval: str = Query("daily"),
):
    normalized_interval = normalize_interval(interval)
    if normalized_interval is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    candles_collection = db["candles"]

    latest_candle = await candles_collection.find_one(
        {"pair": pair, "interval": normalized_interval},
        {"_id": 0, "fetched_at": 1},
        sort=[("fetched_at", -1)],
    )
    if not latest_candle:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data found for {pair} {normalized_interval}. Fetch candles first.",
        )

    cursor = candles_collection.find(
        {"pair": pair, "interval": normalized_interval},
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", 1)
    candles = await cursor.to_list(length=5000)

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data found for {pair} {normalized_interval}. Fetch candles first.",
        )

    bos_detect = COMPONENTS["bos"]
    fvg_detect = COMPONENTS["fvg"]

    bos_signals = bos_detect(candles)
    fvg_signals = fvg_detect(candles)

    return simulate_candles(candles, bos_signals, fvg_signals, normalized_interval)
