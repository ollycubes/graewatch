from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS
from engine.prediction import predict
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase = None

# Maps each current-TF interval to its higher timeframe for bias computation.
HTF_MAP = {
    "15min": "1h",
    "1h": "4h",
    "4h": "daily",
    "daily": "weekly",
    "weekly": None,
}


@router.get("/api/prediction")
async def get_prediction(
    pair: str = Query(...),
    interval: str = Query("daily"),
):
    """
    Generate a next-period price prediction by combining all strategy signals.
    """
    normalized_interval = normalize_interval(interval)
    if normalized_interval is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    candles_collection = db["candles"]

    # ── Fetch candles ────────────────────────────────────────────────────
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

    # ── Run all strategy detectors on current TF ─────────────────────────
    bos_signals = COMPONENTS["bos"](candles)
    fvg_signals = COMPONENTS["fvg"](candles)
    gann_signals = COMPONENTS["gann"](candles)
    ob_signals = COMPONENTS["orderblocks"](candles)

    # ── HTF data for bias ────────────────────────────────────────────────
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

    # ── Run prediction engine ────────────────────────────────────────────
    result = predict(
        candles=candles,
        bos_signals=bos_signals,
        fvg_signals=fvg_signals,
        gann_signals=gann_signals,
        ob_signals=ob_signals,
        htf_bos_signals=htf_bos_signals,
        htf_gann_signals=htf_gann_signals,
        htf_candles=htf_candles,
    )

    return {
        "pair": pair,
        "interval": normalized_interval,
        **result,
    }
