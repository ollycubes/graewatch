from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS
from engine.setup import detect as detect_setup
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


@router.get("/api/setup")
async def get_setup(
    pair: str = Query(...),
    interval: str = Query("daily"),
    start: str | None = Query(None, description="Optional start timestamp to filter candles"),
    end: str | None = Query(None, description="Optional end timestamp to filter candles"),
):
    """
    Identify an SMC trade setup (entry POI, target, stop, R:R) from current
    and higher-timeframe signals within the optionally specified time range.
    """
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    normalized_interval = normalize_interval(interval)
    if normalized_interval is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    candles_collection = db["candles"]

    # ── Fetch candles (optionally scoped to selection range) ─────────────────
    candle_filter: dict = {"pair": pair, "interval": normalized_interval}
    if start is not None or end is not None:
        ts_filter: dict = {}
        if start is not None:
            ts_filter["$gte"] = start
        if end is not None:
            ts_filter["$lte"] = end
        candle_filter["timestamp"] = ts_filter

    cursor = candles_collection.find(
        candle_filter,
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", 1)
    candles = await cursor.to_list(length=5000)

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data for {pair} {normalized_interval}. Fetch candles first.",
        )

    # ── Run detectors on current TF ──────────────────────────────────────────
    bos_signals = COMPONENTS["bos"](candles)
    fvg_signals = COMPONENTS["fvg"](candles)
    ob_signals = COMPONENTS["orderblocks"](candles)
    liq_signals = COMPONENTS["liquidity"](candles)

    # ── HTF data for bias computation ────────────────────────────────────────
    htf_bos_signals = None
    htf_gann_signals = None
    htf_candles = None
    htf_interval = HTF_MAP.get(normalized_interval)

    if htf_interval:
        htf_cursor = candles_collection.find(
            {"pair": pair, "interval": htf_interval},
            {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
        ).sort("timestamp", 1)
        htf_candles = await htf_cursor.to_list(length=5000)

        if htf_candles:
            htf_bos_signals = COMPONENTS["bos"](htf_candles)
            htf_gann_signals = COMPONENTS["gann"](htf_candles)

    # ── Detect setup ─────────────────────────────────────────────────────────
    result = detect_setup(
        candles=candles,
        bos_signals=bos_signals,
        fvg_signals=fvg_signals,
        ob_signals=ob_signals,
        liq_signals=liq_signals,
        htf_bos_signals=htf_bos_signals,
        htf_gann_signals=htf_gann_signals,
        htf_candles=htf_candles,
    )

    return {"pair": pair, "interval": normalized_interval, **result}
