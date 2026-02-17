from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase = None


@router.get("/api/analysis/{component}")
async def get_analysis(
    component: str,
    pair: str = Query(...),
    interval: str = Query("daily"),
):
    normalized_interval = normalize_interval(interval)
    if normalized_interval is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    # Check the component exists
    if component not in COMPONENTS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown component: {component}. Available: {list(COMPONENTS.keys())}",
        )

    # Get latest candle fetch marker for cache validation.
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

    # Reuse cached analysis if computed against current candle snapshot.
    latest_fetched_at = latest_candle["fetched_at"]
    analysis_collection = db["analysis"]
    cached = await analysis_collection.find_one(
        {
            "component": component,
            "pair": pair,
            "interval": normalized_interval,
            "candles_fetched_at": latest_fetched_at,
        },
        {"_id": 0, "component": 1, "pair": 1, "interval": 1, "count": 1, "signals": 1},
    )
    if cached:
        return cached

    # Get candles from MongoDB only if analysis cache is stale/missing.
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

    # Run the algorithm
    detect_fn = COMPONENTS[component]
    results = detect_fn(candles)

    # Store results in the analysis collection.
    payload = {
        "component": component,
        "pair": pair,
        "interval": normalized_interval,
        "count": len(results),
        "signals": results,
    }
    await analysis_collection.update_one(
        {"component": component, "pair": pair, "interval": normalized_interval},
        {"$set": {**payload, "candles_fetched_at": latest_fetched_at}},
        upsert=True,
    )

    return payload
