"""
Zone prediction engine.

This is a POST-PROCESSING layer on top of the existing signal detectors.
It does not replace any detector — it converts their outputs into ranked,
clustered zone predictions.

Pipeline
--------
existing signals (FVG / OB / Wyckoff / Liquidity / BOS)
  → zone_adapters   (signal dict → Zone dict)
  → zone_scoring    (Zone + Context → ScoredZone)
  → zone_cluster    (ScoredZone[] → merged, sorted ScoredZone[])

Public API
----------
detect(candles)          — keeps the COMPONENTS registry signature; returns []
detect_zones(...)        — full pipeline; call this from routes/zones.py
"""

from __future__ import annotations

from engine.setup import _compute_atr, _determine_bias
from engine.zone_adapters import fvg_to_zone, ob_to_zone, wyckoff_to_zone
from engine.zone_cluster import cluster_zones
from engine.zone_scoring import score_zone
from engine.zone_types import Context, Zone


def detect_zones(
    candles: list[dict],
    bos_signals: list[dict],
    fvg_signals: list[dict],
    ob_signals: list[dict],
    liq_signals: list[dict],
    wyckoff_signals: list[dict] | None = None,
    htf_bos_signals: list[dict] | None = None,
    htf_gann_signals: list[dict] | None = None,
    htf_candles: list[dict] | None = None,
    htf_interval: str | None = None,
) -> dict:
    """
    Return all unmitigated, bias-aligned zones ranked by score.

    Response shape
    --------------
    {
      "bias":    "bullish" | "bearish" | "neutral",
      "context": Context,
      "zones":   list[ScoredZone]   # sorted by score descending
    }
    """
    if not candles:
        return {"bias": "neutral", "context": {}, "zones": []}

    atr = _compute_atr(candles)
    current_close = candles[-1]["close"]

    bias = _determine_bias(
        bos_signals, htf_bos_signals, htf_gann_signals, htf_candles
    )

    context: Context = {
        "bias": bias,
        "htf_bias_source": _bias_source(bos_signals, htf_bos_signals),
        "current_close": round(current_close, 5),
        "atr": round(atr, 6),
        "htf_interval": htf_interval,
    }

    if bias == "neutral":
        return {"bias": "neutral", "context": context, "zones": []}

    # ── Collect candidates ────────────────────────────────────────────────────
    raw_zones: list[Zone] = []

    for fvg in fvg_signals:
        if fvg.get("end_timestamp") is not None:
            continue
        if fvg["direction"] == bias:
            raw_zones.append(fvg_to_zone(fvg))

    for ob in ob_signals:
        if ob.get("end_timestamp") is not None:
            continue
        if ob["direction"] == bias:
            raw_zones.append(ob_to_zone(ob))

    for wy in (wyckoff_signals or []):
        if wy.get("direction") == bias:
            raw_zones.append(wyckoff_to_zone(wy, atr))

    # ── Score ─────────────────────────────────────────────────────────────────
    scored = [score_zone(z, context, liq_signals) for z in raw_zones]

    # ── Cluster ───────────────────────────────────────────────────────────────
    clustered = cluster_zones(scored, atr)

    return {"bias": bias, "context": context, "zones": clustered}


# ── Internal ──────────────────────────────────────────────────────────────────


def _bias_source(bos_signals: list[dict], htf_bos_signals: list[dict] | None) -> str:
    if htf_bos_signals:
        return "htf_bos"
    if bos_signals:
        return "current_bos"
    return "neutral"
