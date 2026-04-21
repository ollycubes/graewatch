from __future__ import annotations
from decimal import Decimal
from engine.setup import _compute_atr, _determine_bias
from engine.zone_adapters import fvg_to_zone, ob_to_zone, wyckoff_to_zone
from engine.zone_cluster import cluster_zones
from engine.zone_scoring import score_zone
from engine.zone_types import Context, Zone

# ── TF ordering ───────────────────────────────────────────────────────────────
TF_ORDER = ["weekly", "daily", "4h", "1h", "15min"]

TF_DETECTORS: dict[str, list[str]] = {
    "weekly": ["fvg", "orderblocks"],
    "daily":  ["bos", "orderblocks", "liquidity"],
    "4h":     ["bos", "fvg", "orderblocks", "liquidity", "gann"],
    "1h":     ["bos", "fvg", "orderblocks", "liquidity"],
    "15min":  ["bos", "fvg", "orderblocks", "liquidity", "wyckoff"],
}

# Score added when a higher TF has an overlapping zone
TF_CONFLUENCE_BONUS: dict[str, Decimal] = {
    "weekly": Decimal("25.0"),
    "daily":  Decimal("20.0"),
    "4h":     Decimal("15.0"),
    "1h":     Decimal("10.0"),
}

# Bonus when the zone sits in the correct Gann premium/discount half
GANN_ZONE_BONUS = Decimal("15.0")


def detect_confluence(
    tf_candles:  dict[str, list[dict]],
    tf_bos:      dict[str, list[dict]],
    tf_fvg:      dict[str, list[dict]],
    tf_ob:       dict[str, list[dict]],
    tf_liq:      dict[str, list[dict]],
    tf_wyckoff:  dict[str, list[dict]],
    tf_gann:     dict[str, list[dict]],
    current_tf:  str,
) -> dict:
    """
    Return ranked confluence zones for `current_tf`.
    Prices are assumed to be decimal.Decimal objects.
    """
    current_candles = tf_candles.get(current_tf, [])
    if not current_candles:
        return {"bias": "neutral", "bias_chain": {}, "context": {}, "zones": []}

    atr = _compute_atr(current_candles)
    current_close = current_candles[-1]["close"]

    # ── Bias determination ───────────────────────────────────────────────────
    current_idx = TF_ORDER.index(current_tf) if current_tf in TF_ORDER else len(TF_ORDER)
    higher_tfs = [tf for tf in TF_ORDER[:current_idx] if tf in tf_candles]

    htf_bos = None
    htf_gann = None
    htf_candles_for_bias = None
    for htf in reversed(higher_tfs):
        if tf_bos.get(htf):
            htf_bos = tf_bos[htf]
            htf_gann = tf_gann.get(htf)
            htf_candles_for_bias = tf_candles.get(htf)
            break

    bias = _determine_bias(
        tf_bos.get(current_tf, []),
        htf_bos,
        htf_gann,
        htf_candles_for_bias,
    )

    # ── Bias chain ───────────────────────────────────────────────────────────
    bias_chain: dict[str, str] = {}
    for tf in TF_ORDER:
        if tf not in tf_candles:
            continue
        tf_bias = _determine_bias(
            tf_bos.get(tf, []),
            None,
            tf_gann.get(tf) or None,
            tf_candles.get(tf) or None,
        )
        bias_chain[tf] = tf_bias

    context: Context = {
        "bias": bias,
        "htf_bias_source": "htf_bos" if htf_bos else "current_bos",
        "current_close": current_close,
        "atr": atr,
        "htf_interval": higher_tfs[-1] if higher_tfs else None,
    }

    if bias == "neutral":
        return {"bias": "neutral", "bias_chain": bias_chain, "context": context, "zones": []}

    # ── Collect zones at each TF ──────────────────────────────────────────────
    tf_zone_map: dict[str, list[Zone]] = {}
    for tf in TF_ORDER:
        if tf not in tf_candles:
            continue
        tf_atr = _compute_atr(tf_candles[tf])
        tf_zone_map[tf] = _collect_zones(
            tf=tf,
            fvg_signals=tf_fvg.get(tf, []),
            ob_signals=tf_ob.get(tf, []),
            wyckoff_signals=tf_wyckoff.get(tf, []),
            bias=bias,
            atr=tf_atr,
        )

    # ── Score current-TF zones with TF confluence bonuses ────────────────────
    liq_signals = tf_liq.get(current_tf, [])
    gann_4h = tf_gann.get("4h") or None
    candles_4h = tf_candles.get("4h") or None
    current_zones = tf_zone_map.get(current_tf, [])

    scored = []
    for zone in current_zones:
        base = score_zone(zone, context, liq_signals)
        tf_bonus, tf_matches = _score_tf_confluence(
            zone, tf_zone_map, current_tf, gann_4h, candles_4h, bias
        )
        breakdown = dict(base["score_breakdown"])
        breakdown["tf_confluence"] = tf_bonus
        scored.append({
            **base,
            "score": base["score"] + tf_bonus,
            "score_breakdown": breakdown,
            "tf_matches": tf_matches,
        })

    clustered = cluster_zones(scored, atr)

    return {
        "bias": bias,
        "bias_chain": bias_chain,
        "context": context,
        "zones": clustered,
    }


def _collect_zones(
    tf: str,
    fvg_signals: list[dict],
    ob_signals: list[dict],
    wyckoff_signals: list[dict],
    bias: str,
    atr: Decimal,
) -> list[Zone]:
    detectors = TF_DETECTORS.get(tf, [])
    zones: list[Zone] = []

    if "fvg" in detectors:
        for fvg in fvg_signals:
            if fvg.get("end_timestamp") is not None:
                continue
            if fvg["direction"] == bias:
                zones.append(fvg_to_zone(fvg))

    if "orderblocks" in detectors:
        for ob in ob_signals:
            if ob.get("end_timestamp") is not None:
                continue
            if ob["direction"] == bias:
                zones.append(ob_to_zone(ob))

    if "wyckoff" in detectors:
        for wy in wyckoff_signals:
            if wy.get("direction") == bias:
                zones.append(wyckoff_to_zone(wy, atr))

    return zones


def _zones_overlap(a: dict, b: dict) -> bool:
    return a["bottom"] <= b["top"] and b["bottom"] <= a["top"]


def _score_tf_confluence(
    zone: dict,
    tf_zone_map: dict[str, list[Zone]],
    current_tf: str,
    gann_4h: list[dict] | None,
    candles_4h: list[dict] | None,
    bias: str,
) -> tuple[Decimal, list[str]]:
    current_idx = TF_ORDER.index(current_tf) if current_tf in TF_ORDER else len(TF_ORDER)
    higher_tfs = TF_ORDER[:current_idx]

    total = Decimal("0.0")
    matches: list[str] = []

    for tf in higher_tfs:
        for tz in tf_zone_map.get(tf, []):
            if _zones_overlap(zone, tz):
                total += TF_CONFLUENCE_BONUS.get(tf, Decimal("0.0"))
                matches.append(tf)
                break

    # Gann premium/discount bonus
    if gann_4h and candles_4h:
        latest_gann = gann_4h[-1]
        mid = (latest_gann["high_price"] + latest_gann["low_price"]) / Decimal("2")
        zone_mid = (zone["top"] + zone["bottom"]) / Decimal("2")
        in_correct_half = (
            (bias == "bullish" and zone_mid < mid) or
            (bias == "bearish" and zone_mid > mid)
        )
        if in_correct_half:
            total += GANN_ZONE_BONUS
            matches.append("gann")

    return total, matches
