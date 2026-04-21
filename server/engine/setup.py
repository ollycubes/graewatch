from __future__ import annotations
from decimal import Decimal


def detect(
    candles: list[dict],
    bos_signals: list[dict],
    fvg_signals: list[dict],
    ob_signals: list[dict],
    liq_signals: list[dict],  # noqa: ARG001 — reserved for future stop-hunt confluence
    htf_bos_signals: list[dict] | None = None,
    htf_gann_signals: list[dict] | None = None,
    htf_candles: list[dict] | None = None,
    wyckoff_signals: list[dict] | None = None,
    htf_interval: str | None = None,
) -> dict:
    """
    Identify an SMC trade setup from current and higher-timeframe signals.
    Prices are assumed to be decimal.Decimal objects.
    """
    if not candles:
        return _no_setup("neutral", Decimal("0.0"))

    current_close = candles[-1]["close"]
    atr = _compute_atr(candles)

    # ── 1. Bias ──────────────────────────────────────────────────────────────
    bias = _determine_bias(bos_signals, htf_bos_signals, htf_gann_signals, htf_candles)
    if bias == "neutral":
        return _no_setup("neutral", current_close)

    # ── 2. Entry POI ─────────────────────────────────────────────────────────
    from engine.zones import detect_zones
    
    zones_result = detect_zones(
        candles=candles,
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

    if not zones_result.get("zones"):
        return _no_setup(bias, current_close)

    # Grab the highest-scoring zone
    best_zone = zones_result["zones"][0]
    
    # We must ensure the zone is actually close enough to current price
    zone_mid = (best_zone["top"] + best_zone["bottom"]) / Decimal("2")
    if bias == "bullish" and zone_mid > current_close + atr * Decimal("5"):
        return _no_setup(bias, current_close)
    if bias == "bearish" and zone_mid < current_close - atr * Decimal("5"):
        return _no_setup(bias, current_close)

    entry_poi = {
        "top": best_zone["top"],
        "bottom": best_zone["bottom"],
        "type": best_zone["confluence_types"][0] if best_zone.get("confluence_types") else "confluence",
    }

    # ── 3. Target ────────────────────────────────────────────────────────────
    target_price, target_type = _find_target(
        bias, current_close, ob_signals, fvg_signals, bos_signals
    )
    if target_price is None:
        return _no_setup(bias, current_close)

    # ── 4. Stop ──────────────────────────────────────────────────────────────
    stop = _find_stop(bias, entry_poi, atr)

    # ── 5. Validate geometry ─────────────────────────────────────────────────
    entry_mid = (entry_poi["top"] + entry_poi["bottom"]) / Decimal("2")

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
    at_poi = (
        entry_poi["bottom"] <= current_close <= entry_poi["top"]
        or abs(current_close - entry_poi["top"]) <= atr * Decimal("1.5")
        or abs(current_close - entry_poi["bottom"]) <= atr * Decimal("1.5")
    )

    return {
        "valid": True,
        "bias": bias,
        "entry_top": entry_poi["top"],
        "entry_bottom": entry_poi["bottom"],
        "entry_type": entry_poi["type"],
        "target": target_price,
        "target_type": target_type,
        "stop": stop,
        "risk_reward": reward / risk,
        "at_poi": at_poi,
        "current_close": current_close,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _determine_bias(
    bos_signals: list[dict],
    htf_bos_signals: list[dict] | None,
    htf_gann_signals: list[dict] | None,
    htf_candles: list[dict] | None,
) -> str:
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
        mid = (latest_gann["high_price"] + latest_gann["low_price"]) / Decimal("2")
        gann_bias = "bullish" if latest_close < mid else "bearish"

    if htf_bias and current_bias:
        return htf_bias if htf_bias == current_bias else "neutral"

    if htf_bias:
        if gann_bias and gann_bias != htf_bias:
            return "neutral"
        return htf_bias

    return current_bias or "neutral"


def _find_target(
    bias: str,
    current_close: Decimal,
    ob_signals: list[dict],
    fvg_signals: list[dict],
    bos_signals: list[dict],
) -> tuple[Decimal | None, str | None]:
    opposing = "bearish" if bias == "bullish" else "bullish"
    candidates = []

    # Opposing unmitigated POI zones
    for ob in ob_signals:
        if ob.get("end_timestamp") is not None:
            continue
        if ob["direction"] != opposing:
            continue
        zone_mid = (ob["top"] + ob["bottom"]) / Decimal("2")
        if bias == "bullish" and zone_mid > current_close:
            candidates.append({"price": zone_mid, "type": "ob", "dist": zone_mid - current_close})
        elif bias == "bearish" and zone_mid < current_close:
            candidates.append({"price": zone_mid, "type": "ob", "dist": current_close - zone_mid})

    for fvg in fvg_signals:
        if fvg.get("end_timestamp") is not None:
            continue
        if fvg["direction"] != opposing:
            continue
        zone_mid = (fvg["top"] + fvg["bottom"]) / Decimal("2")
        if bias == "bullish" and zone_mid > current_close:
            candidates.append({"price": zone_mid, "type": "fvg", "dist": zone_mid - current_close})
        elif bias == "bearish" and zone_mid < current_close:
            candidates.append({"price": zone_mid, "type": "fvg", "dist": current_close - zone_mid})

    # BOS swing references
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


def _find_stop(bias: str, entry_poi: dict, atr: Decimal) -> Decimal:
    return (
        entry_poi["bottom"] - atr * Decimal("0.5")
        if bias == "bullish"
        else entry_poi["top"] + atr * Decimal("0.5")
    )


def _no_setup(bias: str, current_close: Decimal) -> dict:
    return {
        "valid": False,
        "bias": bias,
        "current_close": current_close,
    }


def _compute_atr(candles: list[dict], period: int = 14) -> Decimal:
    """Simple Average True Range calculation using Decimal."""
    if len(candles) < 2:
        return Decimal("0.0001")
    true_ranges = []
    for i in range(1, len(candles)):
        h, l, pc = Decimal(str(candles[i]["high"])), Decimal(str(candles[i]["low"])), Decimal(str(candles[i - 1]["close"]))
        true_ranges.append(max(h - l, abs(h - pc), abs(l - pc)))
    recent = true_ranges[-period:]
    return sum(recent) / Decimal(str(len(recent))) if recent else Decimal("0.0001")
