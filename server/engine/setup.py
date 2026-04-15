"""
SMC trade setup detection engine.

Replaces the weighted-voting prediction engine with a structurally-grounded
setup that identifies the three levels a real SMC trade needs:

    Entry POI  — unmitigated OB or FVG in the bias direction near current price
    Target     — nearest opposing structural level price is drawn to
    Stop       — invalidation point just beyond the entry POI

The result is a concrete risk/reward setup rather than an arbitrary confidence
score.
"""

from __future__ import annotations


def detect(
    candles: list[dict],
    bos_signals: list[dict],
    fvg_signals: list[dict],
    ob_signals: list[dict],
    liq_signals: list[dict],
    htf_bos_signals: list[dict] | None = None,
    htf_gann_signals: list[dict] | None = None,
    htf_candles: list[dict] | None = None,
) -> dict:
    """
    Identify an SMC trade setup from current and higher-timeframe signals.

    Returns a dict with:
        valid:         bool   — True when all three levels are found
        bias:          str    — "bullish" | "bearish" | "neutral"
        entry_top:     float  — upper boundary of the entry POI zone
        entry_bottom:  float  — lower boundary of the entry POI zone
        entry_type:    str    — "ob" | "fvg"
        target:        float  — structural target price
        target_type:   str    — "ob" | "fvg" | "swing"
        stop:          float  — invalidation level
        risk_reward:   float  — reward ÷ risk (rounded to 1dp)
        at_poi:        bool   — price is currently at / near the entry zone
        current_close: float
    """
    if not candles:
        return _no_setup("neutral", 0.0)

    current_close = candles[-1]["close"]
    atr = _compute_atr(candles)

    # ── 1. Bias ──────────────────────────────────────────────────────────────
    bias = _determine_bias(bos_signals, htf_bos_signals, htf_gann_signals, htf_candles)
    if bias == "neutral":
        return _no_setup("neutral", current_close)

    # ── 2. Entry POI ─────────────────────────────────────────────────────────
    entry_poi = _find_entry_poi(bias, current_close, atr, ob_signals, fvg_signals)
    if entry_poi is None:
        return _no_setup(bias, current_close)

    # ── 3. Target ────────────────────────────────────────────────────────────
    target_price, target_type = _find_target(
        bias, current_close, ob_signals, fvg_signals, bos_signals
    )
    if target_price is None:
        return _no_setup(bias, current_close)

    # ── 4. Stop ──────────────────────────────────────────────────────────────
    stop = _find_stop(bias, entry_poi, atr)

    # ── 5. Validate geometry ─────────────────────────────────────────────────
    entry_mid = (entry_poi["top"] + entry_poi["bottom"]) / 2

    if bias == "bullish":
        if target_price <= entry_mid or stop >= entry_poi["bottom"]:
            return _no_setup(bias, current_close)
        reward = target_price - entry_mid
        risk = entry_mid - stop
    else:
        if target_price >= entry_mid or stop <= entry_poi["top"]:
            return _no_setup(bias, current_close)
        reward = entry_mid - target_price
        risk = stop - entry_mid

    if risk <= 0 or reward <= 0:
        return _no_setup(bias, current_close)

    # ── 6. At-POI flag ───────────────────────────────────────────────────────
    # True when price is inside or within 1.5 ATR of the entry zone
    at_poi = (
        entry_poi["bottom"] <= current_close <= entry_poi["top"]
        or abs(current_close - entry_poi["top"]) <= atr * 1.5
        or abs(current_close - entry_poi["bottom"]) <= atr * 1.5
    )

    return {
        "valid": True,
        "bias": bias,
        "entry_top": round(entry_poi["top"], 5),
        "entry_bottom": round(entry_poi["bottom"], 5),
        "entry_type": entry_poi["type"],
        "target": round(target_price, 5),
        "target_type": target_type,
        "stop": round(stop, 5),
        "risk_reward": round(reward / risk, 1),
        "at_poi": at_poi,
        "current_close": round(current_close, 5),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _determine_bias(
    bos_signals: list[dict],
    htf_bos_signals: list[dict] | None,
    htf_gann_signals: list[dict] | None,
    htf_candles: list[dict] | None,
) -> str:
    """
    Bias hierarchy:
      1. HTF BOS direction (primary — higher timeframe sets the context)
      2. HTF Gann premium/discount as confirmation of HTF BOS
      3. Current-TF BOS as fallback when no HTF data

    Returns "neutral" when available signals conflict.
    """
    htf_bias: str | None = None
    if htf_bos_signals:
        htf_bias = htf_bos_signals[-1].get("direction")

    current_bias: str | None = None
    if bos_signals:
        current_bias = bos_signals[-1].get("direction")

    gann_bias: str | None = None
    if htf_gann_signals and htf_candles:
        latest_close = htf_candles[-1]["close"]
        latest_gann = htf_gann_signals[-1]
        mid = (latest_gann["high_price"] + latest_gann["low_price"]) / 2
        gann_bias = "bullish" if latest_close < mid else "bearish"

    if htf_bias and current_bias:
        return htf_bias if htf_bias == current_bias else "neutral"

    if htf_bias:
        if gann_bias and gann_bias != htf_bias:
            return "neutral"
        return htf_bias

    return current_bias or "neutral"


def _find_entry_poi(
    bias: str,
    current_close: float,
    atr: float,
    ob_signals: list[dict],
    fvg_signals: list[dict],
) -> dict | None:
    """
    Find the nearest unmitigated OB or FVG in the bias direction.

    For a bullish setup the POI should sit at or below current price (a support
    zone price is returning to). For bearish, at or above (a resistance zone).
    Zones more than 5 ATR away are ignored as too distant to be actionable.
    """
    max_dist = atr * 5
    candidates = []

    for ob in ob_signals:
        if ob.get("end_timestamp") is not None:
            continue
        if ob["direction"] != bias:
            continue
        zone_mid = (ob["top"] + ob["bottom"]) / 2
        if bias == "bullish" and zone_mid > current_close + atr:
            continue
        if bias == "bearish" and zone_mid < current_close - atr:
            continue
        dist = abs(zone_mid - current_close)
        if dist <= max_dist:
            candidates.append({"type": "ob", "top": ob["top"], "bottom": ob["bottom"], "dist": dist})

    for fvg in fvg_signals:
        if fvg.get("end_timestamp") is not None:
            continue
        if fvg["direction"] != bias:
            continue
        zone_mid = (fvg["top"] + fvg["bottom"]) / 2
        if bias == "bullish" and zone_mid > current_close + atr:
            continue
        if bias == "bearish" and zone_mid < current_close - atr:
            continue
        dist = abs(zone_mid - current_close)
        if dist <= max_dist:
            candidates.append({"type": "fvg", "top": fvg["top"], "bottom": fvg["bottom"], "dist": dist})

    return min(candidates, key=lambda x: x["dist"]) if candidates else None


def _find_target(
    bias: str,
    current_close: float,
    ob_signals: list[dict],
    fvg_signals: list[dict],
    bos_signals: list[dict],
) -> tuple[float | None, str | None]:
    """
    Find the nearest structural level price is drawn towards.

    For bullish: look for unmitigated bearish OB/FVG or prior swing highs above
    current price — these are resistance levels where price is likely to react.
    For bearish: the mirror image below.
    """
    opposing = "bearish" if bias == "bullish" else "bullish"
    candidates = []

    # Opposing unmitigated POI zones
    for ob in ob_signals:
        if ob.get("end_timestamp") is not None:
            continue
        if ob["direction"] != opposing:
            continue
        zone_mid = (ob["top"] + ob["bottom"]) / 2
        if bias == "bullish" and zone_mid > current_close:
            candidates.append({"price": zone_mid, "type": "ob", "dist": zone_mid - current_close})
        elif bias == "bearish" and zone_mid < current_close:
            candidates.append({"price": zone_mid, "type": "ob", "dist": current_close - zone_mid})

    for fvg in fvg_signals:
        if fvg.get("end_timestamp") is not None:
            continue
        if fvg["direction"] != opposing:
            continue
        zone_mid = (fvg["top"] + fvg["bottom"]) / 2
        if bias == "bullish" and zone_mid > current_close:
            candidates.append({"price": zone_mid, "type": "fvg", "dist": zone_mid - current_close})
        elif bias == "bearish" and zone_mid < current_close:
            candidates.append({"price": zone_mid, "type": "fvg", "dist": current_close - zone_mid})

    # BOS swing references — the prior highs/lows that were broken, now structural
    for bos in bos_signals:
        level = bos.get("swing_ref")
        if level is None:
            continue
        if bias == "bullish" and bos["direction"] == "bullish" and level > current_close:
            candidates.append({"price": level, "type": "swing", "dist": level - current_close})
        elif bias == "bearish" and bos["direction"] == "bearish" and level < current_close:
            candidates.append({"price": level, "type": "swing", "dist": current_close - level})

    if not candidates:
        return None, None

    best = min(candidates, key=lambda x: x["dist"])
    return best["price"], best["type"]


def _find_stop(bias: str, entry_poi: dict, atr: float) -> float:
    """
    Stop sits just beyond the entry zone with a 0.5-ATR buffer.
    If price reaches the stop, the POI has failed and the setup is invalid.
    """
    return (
        entry_poi["bottom"] - atr * 0.5
        if bias == "bullish"
        else entry_poi["top"] + atr * 0.5
    )


def _no_setup(bias: str, current_close: float) -> dict:
    return {
        "valid": False,
        "bias": bias,
        "current_close": round(current_close, 5) if current_close else 0.0,
    }


def _compute_atr(candles: list[dict], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0001
    true_ranges = []
    for i in range(1, len(candles)):
        h, l, pc = candles[i]["high"], candles[i]["low"], candles[i - 1]["close"]
        true_ranges.append(max(h - l, abs(h - pc), abs(l - pc)))
    recent = true_ranges[-period:]
    return sum(recent) / len(recent) if recent else 0.0001
