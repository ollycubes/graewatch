"""
Confluence-based next-period price prediction engine.

Combines signals from BOS, FVG, Gann, Order Blocks, and Liquidity Sweeps with higher-timeframe
bias to produce a directional forecast, confidence score, target price range,
and a breakdown of which signals contributed.
"""

from __future__ import annotations

# ── Weight table (must sum to 1.0) ───────────────────────────────────────
WEIGHTS = {
    "htf_bos": 0.25,
    "current_bos": 0.20,
    "nearest_fvg": 0.15,
    "nearest_ob": 0.10,
    "gann_position": 0.20,
    "recent_liq": 0.10,
}


def predict(
    candles: list[dict],
    bos_signals: list[dict],
    fvg_signals: list[dict],
    gann_signals: list[dict],
    ob_signals: list[dict],
    liq_signals: list[dict] | None = None,
    htf_bos_signals: list[dict] | None = None,
    htf_gann_signals: list[dict] | None = None,
    htf_candles: list[dict] | None = None,
) -> dict:
    """
    Produce a next-period prediction based on confluence of all strategies.

    Returns a dict with: direction, confidence, target_high, target_low,
    current_close, and a signals breakdown.
    """
    if not candles:
        return _neutral(0.0, {})

    current_close = candles[-1]["close"]
    votes: dict[str, str | None] = {}  # signal_name → "bullish" | "bearish" | None

    # ── 1. HTF BOS bias ──────────────────────────────────────────────────
    htf_bos_dir = _htf_bos_bias(htf_bos_signals)
    votes["htf_bos"] = htf_bos_dir

    # ── 2. Current-TF BOS — most recent signal direction ─────────────────
    current_bos_dir = None
    if bos_signals:
        current_bos_dir = bos_signals[-1].get("direction")
    votes["current_bos"] = current_bos_dir

    # ── 3. Nearest unmitigated FVG ───────────────────────────────────────
    nearest_fvg = _nearest_unmitigated_zone(fvg_signals, current_close)
    fvg_dir = nearest_fvg.get("direction") if nearest_fvg else None
    votes["nearest_fvg"] = fvg_dir

    # ── 4. Nearest unmitigated OB ────────────────────────────────────────
    nearest_ob = _nearest_unmitigated_zone(ob_signals, current_close)
    ob_dir = nearest_ob.get("direction") if nearest_ob else None
    votes["nearest_ob"] = ob_dir

    # ── 5. Gann position — premium/discount ──────────────────────────────
    gann_dir = _gann_bias(gann_signals, current_close)
    votes["gann_position"] = gann_dir

    # ── 6. Most recent liquidity sweep ─────────────────────────────────
    liq_dir = None
    if liq_signals:
        liq_dir = liq_signals[-1].get("direction")
    votes["recent_liq"] = liq_dir

    # ── Compute weighted confluence ──────────────────────────────────────
    bullish_score = 0.0
    bearish_score = 0.0
    total_active_weight = 0.0

    for signal_name, direction in votes.items():
        weight = WEIGHTS[signal_name]
        if direction == "bullish":
            bullish_score += weight
            total_active_weight += weight
        elif direction == "bearish":
            bearish_score += weight
            total_active_weight += weight
        # None → signal absent, doesn't contribute

    # Confidence as percentage of agreeing weight out of total active weight
    if total_active_weight == 0:
        return _neutral(current_close, _build_signals_breakdown(votes, nearest_fvg, nearest_ob))

    if bullish_score >= bearish_score:
        direction = "bullish"
        raw_confidence = bullish_score / total_active_weight
    else:
        direction = "bearish"
        raw_confidence = bearish_score / total_active_weight

    # Scale confidence: 50% agreement → 0 confidence, 100% → 100 confidence
    # This avoids showing "50% confident bullish" when signals are split evenly
    confidence = max(0, int(round((raw_confidence - 0.5) * 200)))

    # If confidence is very low (< 15), call it neutral
    if confidence < 15:
        return _neutral(current_close, _build_signals_breakdown(votes, nearest_fvg, nearest_ob))

    # ── Compute target price range ───────────────────────────────────────
    target_high, target_low = _compute_target_range(
        direction, current_close, candles, nearest_fvg, nearest_ob,
    )

    return {
        "direction": direction,
        "confidence": confidence,
        "target_high": round(target_high, 5),
        "target_low": round(target_low, 5),
        "current_close": round(current_close, 5),
        "signals": _build_signals_breakdown(votes, nearest_fvg, nearest_ob),
    }


# ── Helpers ──────────────────────────────────────────────────────────────


def _neutral(current_close: float, signals: dict) -> dict:
    """Return a neutral / no-prediction result."""
    return {
        "direction": "neutral",
        "confidence": 0,
        "target_high": round(current_close, 5) if current_close else 0,
        "target_low": round(current_close, 5) if current_close else 0,
        "current_close": round(current_close, 5) if current_close else 0,
        "signals": signals,
    }


def _htf_bos_bias(htf_bos_signals: list[dict] | None) -> str | None:
    """Direction of the most recent HTF BOS signal."""
    if not htf_bos_signals:
        return None
    return htf_bos_signals[-1].get("direction")


def _nearest_unmitigated_zone(
    zones: list[dict], current_close: float,
) -> dict | None:
    """
    Find the nearest unmitigated FVG or OB zone to the current price.
    Unmitigated = end_timestamp is None.
    """
    unmitigated = [z for z in zones if z.get("end_timestamp") is None]
    if not unmitigated:
        return None

    # Find the zone whose midpoint is closest to current close
    def distance(zone: dict) -> float:
        mid = (zone["top"] + zone["bottom"]) / 2
        return abs(mid - current_close)

    return min(unmitigated, key=distance)


def _gann_bias(gann_signals: list[dict], current_close: float) -> str | None:
    """
    If price is in the discount half (below midpoint) of the latest Gann box,
    bias is bullish (expect mean-reversion up). Premium half → bearish.
    """
    if not gann_signals:
        return None
    latest = gann_signals[-1]
    midpoint = (latest["high_price"] + latest["low_price"]) / 2
    return "bullish" if current_close < midpoint else "bearish"


def _compute_target_range(
    direction: str,
    current_close: float,
    candles: list[dict],
    nearest_fvg: dict | None,
    nearest_ob: dict | None,
) -> tuple[float, float]:
    """
    Compute a target price range for the prediction.

    Strategy:
    1. Use nearest unmitigated FVG/OB zone in the predicted direction as the target
    2. Fall back to ATR-based range if no zones available
    """
    # Try to use zone targets
    target_zone = None
    for zone in [nearest_fvg, nearest_ob]:
        if zone and zone.get("direction") == direction:
            target_zone = zone
            break

    if target_zone:
        if direction == "bullish":
            # Bullish: expect price to rise towards/into the zone
            target_high = target_zone["top"]
            target_low = min(current_close, target_zone["bottom"])
        else:
            # Bearish: expect price to fall towards/into the zone
            target_high = max(current_close, target_zone["top"])
            target_low = target_zone["bottom"]

        return target_high, target_low

    # Fallback: ATR-based range (average true range of last 14 candles)
    atr = _compute_atr(candles, period=14)

    if direction == "bullish":
        target_high = current_close + atr
        target_low = current_close - (atr * 0.3)  # small downside buffer
    else:
        target_high = current_close + (atr * 0.3)
        target_low = current_close - atr

    return target_high, target_low


def _compute_atr(candles: list[dict], period: int = 14) -> float:
    """Simple Average True Range calculation."""
    if len(candles) < 2:
        return 0.0

    true_ranges = []
    for i in range(1, len(candles)):
        high = candles[i]["high"]
        low = candles[i]["low"]
        prev_close = candles[i - 1]["close"]
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        true_ranges.append(tr)

    # Use the last `period` TRs
    recent = true_ranges[-period:]
    return sum(recent) / len(recent) if recent else 0.0


def _build_signals_breakdown(
    votes: dict[str, str | None],
    nearest_fvg: dict | None,
    nearest_ob: dict | None,
) -> dict:
    """Build the signals sub-object for the API response."""
    signals: dict = {}
    signals["htf_bos"] = votes.get("htf_bos")
    signals["current_bos"] = votes.get("current_bos")

    if nearest_fvg:
        signals["nearest_fvg"] = {
            "direction": nearest_fvg["direction"],
            "top": round(nearest_fvg["top"], 5),
            "bottom": round(nearest_fvg["bottom"], 5),
        }
    else:
        signals["nearest_fvg"] = None

    if nearest_ob:
        signals["nearest_ob"] = {
            "direction": nearest_ob["direction"],
            "top": round(nearest_ob["top"], 5),
            "bottom": round(nearest_ob["bottom"], 5),
        }
    else:
        signals["nearest_ob"] = None

    signals["gann_position"] = votes.get("gann_position")
    signals["recent_liq"] = votes.get("recent_liq")
    return signals
