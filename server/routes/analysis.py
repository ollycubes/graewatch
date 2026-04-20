from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase | None = None


@router.get("/api/analysis/{component}")
async def get_analysis(
    component: str,
    pair: str = Query(...),
    interval: str = Query("daily"),
    start: str | None = Query(None, description="Optional start timestamp to filter candles (inclusive)"),
    end: str | None = Query(None, description="Optional end timestamp to filter candles (inclusive)"),
):
    # Normalise the interval
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

    is_ranged = start is not None or end is not None

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
    # Skip cache for ranged queries — they are ad-hoc.
    latest_fetched_at = latest_candle["fetched_at"]
    analysis_collection = db["analysis"]
    if not is_ranged:
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

    # We do NOT pre-filter the candles by start/end.
    # The algorithms need to see future price action to determine mitigations.
    # We will filter the *resulting signals* instead.
    candle_filter = {"pair": pair, "interval": normalized_interval}
    if end:
        candle_filter["timestamp"] = {"$lte": end}

    # Get candles from MongoDB only if analysis cache is stale/missing.
    cursor = candles_collection.find(
        candle_filter,
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", -1)
    candles = await cursor.to_list(length=5000)
    candles.reverse()

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data found for {pair} {normalized_interval}. Fetch candles first.",
        )

    # Run the algorithms on the FULL dataset
    detect_fn = COMPONENTS[component]
    results = detect_fn(candles)

    # Filter the signals to only include those originating in the user's selection
    if is_ranged:
        filtered = []
        for r in results:
            ts = r.get("source_timestamp") or r.get("start_timestamp") or r.get("timestamp")
            if ts:
                if start and ts < start: continue
                if end and ts > end: continue
            filtered.append(r)
        results = filtered

    # Build the response payload.
    payload = {
        "component": component,
        "pair": pair,
        "interval": normalized_interval,
        "count": len(results),
        "signals": results,
    }

    # Only cache non-ranged results.
    if not is_ranged:
        await analysis_collection.update_one(
            {"component": component, "pair": pair, "interval": normalized_interval},
            {"$set": {**payload, "candles_fetched_at": latest_fetched_at}},
            upsert=True,
        )

    return payload # This is the payload that will be sent to the frontend
