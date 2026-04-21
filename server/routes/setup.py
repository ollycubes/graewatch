from __future__ import annotations
import time
from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS
from engine.setup import detect as detect_setup
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval
from utils.audit import log_performance
from utils.precision import convert_candles_to_decimal, convert_to_float

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
    # We fetch ALL candles up to the end date to allow algorithms to detect mitigations.
    # We'll filter the resulting signals later.
    candle_filter: dict = {"pair": pair, "interval": normalized_interval}
    if end:
        candle_filter["timestamp"] = {"$lte": end}

    cursor = candles_collection.find(
        candle_filter,
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", -1)
    candles = await cursor.to_list(length=5000)
    candles.reverse()
    
    # Convert to Decimal for engine processing
    decimal_candles = convert_candles_to_decimal(candles)

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data for {pair} {normalized_interval}. Fetch candles first.",
        )

    # ── Run detectors on current TF ──────────────────────────────────────────
    bos_signals = COMPONENTS["bos"](decimal_candles)
    fvg_signals = COMPONENTS["fvg"](decimal_candles)
    ob_signals = COMPONENTS["orderblocks"](decimal_candles)
    liq_signals = COMPONENTS["liquidity"](decimal_candles)
    wyckoff_signals = COMPONENTS["wyckoff"](decimal_candles)

    # Filter signals to only those originating in the selection window
    def filter_signals(signals):
        if start is None and end is None:
            return signals
        filtered = []
        for s in signals:
            ts = s.get("source_timestamp") or s.get("start_timestamp") or s.get("timestamp")
            if ts:
                if start and ts < start: continue
                if end and ts > end: continue
            filtered.append(s)
        return filtered

    bos_signals = filter_signals(bos_signals)
    fvg_signals = filter_signals(fvg_signals)
    ob_signals = filter_signals(ob_signals)
    liq_signals = filter_signals(liq_signals)
    wyckoff_signals = filter_signals(wyckoff_signals)

    # ── HTF data for bias computation ────────────────────────────────────────
    htf_bos_signals = None
    htf_gann_signals = None
    htf_candles = None
    htf_interval = HTF_MAP.get(normalized_interval)

    if htf_interval:
        htf_filter = {"pair": pair, "interval": htf_interval}
        if end:
            htf_filter["timestamp"] = {"$lte": end}
            
        htf_cursor = candles_collection.find(
            htf_filter,
            {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
        ).sort("timestamp", -1)
        htf_candles = await htf_cursor.to_list(length=5000)
        htf_candles.reverse()

        if htf_candles:
            decimal_htf_candles = convert_candles_to_decimal(htf_candles)
            htf_bos_signals = COMPONENTS["bos"](decimal_htf_candles)
            htf_gann_signals = COMPONENTS["gann"](decimal_htf_candles)
            # Use decimal HTF candles for detection
            htf_candles = decimal_htf_candles

    # ── Detect setup ─────────────────────────────────────────────────────────
    start_time = time.time()
    result = detect_setup(
        candles=decimal_candles,
        bos_signals=bos_signals,
        fvg_signals=fvg_signals,
        ob_signals=ob_signals,
        liq_signals=liq_signals,
        wyckoff_signals=wyckoff_signals,
        htf_bos_signals=htf_bos_signals,
        htf_gann_signals=htf_gann_signals,
        htf_candles=htf_candles,
        htf_interval=htf_interval,
    )
    duration_ms = (time.time() - start_time) * 1000
    
    await log_performance(db, "setup_detection", duration_ms, {
        "pair": pair,
        "interval": normalized_interval,
        "valid": result.get("valid", False),
        "bias": result.get("bias", "neutral")
    })

    # Convert results back to float for JSON response
    result = convert_to_float(result)

    return {"pair": pair, "interval": normalized_interval, **result}
