"""
GET /api/confluence

Multi-timeframe confluence zone endpoint.  Fetches candles and runs
detectors for every timeframe from weekly down to the requested interval,
then scores zones by cross-TF overlap.

Unlike /api/zones (single-TF) and /api/setup (single winner), this
endpoint returns ALL scored zones with a per-zone breakdown of which
timeframes confirmed it.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from engine import COMPONENTS
from engine.confluence import TF_DETECTORS, TF_ORDER, detect_confluence
from routes.intervals import SUPPORTED_INTERVALS, normalize_interval

router = APIRouter()

db: AsyncIOMotorDatabase | None = None

# Same map as setup.py and dashboardStore.js
HTF_MAP = {
    "15min": "1h",
    "1h": "4h",
    "4h": "daily",
    "daily": "weekly",
    "weekly": None,
}


async def _fetch_candles(
    col,
    pair: str,
    interval: str,
    start: str | None = None,
    end: str | None = None,
) -> list[dict]:
    """Fetch candles for one TF, optionally scoped to a time range."""
    # We fetch ALL candles up to the end date to allow algorithms to detect mitigations.
    # We will filter the signals instead.
    query: dict = {"pair": pair, "interval": interval}
    if end:
        query["timestamp"] = {"$lte": end}

    cursor = col.find(
        query,
        {"_id": 0, "timestamp": 1, "open": 1, "high": 1, "low": 1, "close": 1},
    ).sort("timestamp", -1)
    candles = await cursor.to_list(length=5000)
    candles.reverse()
    return candles


@router.get("/api/confluence")
async def get_confluence(
    pair: str = Query(...),
    interval: str = Query("15min"),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """
    Return all scored confluence zones for the given pair and interval.

    The selection range (start/end) is applied to the current-TF candles only.
    Higher-TF candles are always fetched without a range so they provide full
    structural context regardless of the selection window.
    """
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    normalized = normalize_interval(interval)
    if normalized is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported interval '{interval}'. Use one of: {list(SUPPORTED_INTERVALS)}",
        )

    # Build the list of TFs to fetch: everything from weekly down to current
    current_idx = TF_ORDER.index(normalized) if normalized in TF_ORDER else len(TF_ORDER)
    relevant_tfs = TF_ORDER[:current_idx + 1]  # includes current TF

    col = db["candles"]

    # ── Fetch all TF candles in parallel ─────────────────────────────────────
    async def fetch_tf(tf: str) -> tuple[str, list[dict]]:
        # Fetch full dataset for ALL timeframes up to end date
        candles = await _fetch_candles(col, pair, tf, start, end)
        return tf, candles

    candle_results = await asyncio.gather(*[fetch_tf(tf) for tf in relevant_tfs])
    tf_candles = {tf: c for tf, c in candle_results if c}

    if not tf_candles.get(normalized):
        raise HTTPException(
            status_code=404,
            detail=f"No candle data for {pair} {normalized}. Fetch candles first.",
        )

    # ── Run detectors for each TF (only checklist-relevant ones) ─────────────
    tf_bos:     dict[str, list[dict]] = {}
    tf_fvg:     dict[str, list[dict]] = {}
    tf_ob:      dict[str, list[dict]] = {}
    tf_liq:     dict[str, list[dict]] = {}
    tf_wyckoff: dict[str, list[dict]] = {}
    tf_gann:    dict[str, list[dict]] = {}

    for tf, candles in tf_candles.items():
        detectors = TF_DETECTORS.get(tf, [])
        if "bos" in detectors:
            tf_bos[tf] = COMPONENTS["bos"](candles)
        if "fvg" in detectors:
            tf_fvg[tf] = COMPONENTS["fvg"](candles)
        if "orderblocks" in detectors:
            tf_ob[tf] = COMPONENTS["orderblocks"](candles)
        if "liquidity" in detectors:
            tf_liq[tf] = COMPONENTS["liquidity"](candles)
        if "wyckoff" in detectors:
            tf_wyckoff[tf] = COMPONENTS["wyckoff"](candles)
        if "gann" in detectors:
            tf_gann[tf] = COMPONENTS["gann"](candles)
            
        # Filter the current TF's signals by the selection range
        if tf == normalized and (start is not None or end is not None):
            def filter_signals(signals):
                filtered = []
                for s in signals:
                    t = s.get("source_timestamp") or s.get("start_timestamp") or s.get("timestamp")
                    if t:
                        if start and t < start: continue
                        if end and t > end: continue
                    filtered.append(s)
                return filtered
                
            if "bos" in detectors: tf_bos[tf] = filter_signals(tf_bos[tf])
            if "fvg" in detectors: tf_fvg[tf] = filter_signals(tf_fvg[tf])
            if "orderblocks" in detectors: tf_ob[tf] = filter_signals(tf_ob[tf])
            if "liquidity" in detectors: tf_liq[tf] = filter_signals(tf_liq[tf])
            if "wyckoff" in detectors: tf_wyckoff[tf] = filter_signals(tf_wyckoff[tf])
            if "gann" in detectors: tf_gann[tf] = filter_signals(tf_gann[tf])

    # ── Run confluence engine ─────────────────────────────────────────────────
    result = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=tf_fvg,
        tf_ob=tf_ob,
        tf_liq=tf_liq,
        tf_wyckoff=tf_wyckoff,
        tf_gann=tf_gann,
        current_tf=normalized,
    )

    return {"pair": pair, "interval": normalized, **result}
