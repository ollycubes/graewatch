from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from engine import COMPONENTS
from engine.zones import detect_zones
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase | None = None

HTF_MAP = {
    "15min": "1h",
    "1h": "4h",
    "4h": "daily",
    "daily": "weekly",
    "weekly": None,
}


@router.get("/api/zones")
async def get_zones(
    pair: str = Query(...),
    interval: str = Query("daily"),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """
    Return all unmitigated, bias-aligned zones ranked by score.

    This is a post-processing layer on top of the existing detectors —
    it does not replace /api/setup.  Use it to see ALL scored zone
    candidates, not just the single highest-priority one.
    """
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    normalized = normalize_interval(interval)
    if normalized is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    candles_col = db["candles"]

    candle_filter: dict = {"pair": pair, "interval": normalized}
    if start is not None or end is not None:
        ts: dict = {}
        if start is not None:
            ts["$gte"] = start
        if end is not None:
            ts["$lte"] = end
        candle_filter["timestamp"] = ts

    cursor = candles_col.find(
        candle_filter,
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", 1)
    candles = await cursor.to_list(length=5000)

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data for {pair} {normalized}. Fetch candles first.",
        )

    bos = COMPONENTS["bos"](candles)
    fvg = COMPONENTS["fvg"](candles)
    ob = COMPONENTS["orderblocks"](candles)
    liq = COMPONENTS["liquidity"](candles)
    wyckoff = COMPONENTS["wyckoff"](candles)

    htf_bos = None
    htf_gann = None
    htf_candles = None
    htf_interval = HTF_MAP.get(normalized)

    if htf_interval:
        htf_cur = candles_col.find(
            {"pair": pair, "interval": htf_interval},
            {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
        ).sort("timestamp", 1)
        htf_candles = await htf_cur.to_list(length=5000)

        if htf_candles:
            htf_bos = COMPONENTS["bos"](htf_candles)
            htf_gann = COMPONENTS["gann"](htf_candles)

    result = detect_zones(
        candles=candles,
        bos_signals=bos,
        fvg_signals=fvg,
        ob_signals=ob,
        liq_signals=liq,
        wyckoff_signals=wyckoff,
        htf_bos_signals=htf_bos,
        htf_gann_signals=htf_gann,
        htf_candles=htf_candles,
        htf_interval=htf_interval,
    )

    return {"pair": pair, "interval": normalized, **result}
