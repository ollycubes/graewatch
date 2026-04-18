"""
Zone scoring engine.

Takes a Zone and a Context (both produced from existing signals) and returns
a ScoredZone.  This is a post-processing step — it does not run or modify
any detector.

Score components
----------------
type        Wyckoff=30  OB=20  FVG=10   — conviction weight per source
proximity   0–25        — linear decay over 5 ATR; reward nearness to price
at_poi      +15         — price is inside or within 1.5 ATR of the zone
liquidity   +15         — an unswept liq pool sits within 1 ATR of zone edge
cluster     0           — filled in by zone_cluster.py after merging
"""

from __future__ import annotations

from engine.zone_types import Context, ScoredZone, Zone

_TYPE_BASE: dict[str, float] = {"wyckoff": 30.0, "ob": 20.0, "fvg": 10.0}
_PROXIMITY_MAX = 25.0
_AT_POI_BONUS = 15.0
_LIQ_BONUS = 15.0
_MAX_DIST_ATR = 5.0


def score_zone(zone: Zone, context: Context, liq_signals: list[dict]) -> ScoredZone:
    atr = context["atr"]
    close = context["current_close"]
    max_dist = atr * _MAX_DIST_ATR

    mid = (zone["top"] + zone["bottom"]) / 2
    dist = abs(mid - close)

    type_score = _TYPE_BASE.get(zone["source_type"], 0.0)

    proximity_score = (
        _PROXIMITY_MAX * max(0.0, 1.0 - dist / max_dist)
        if max_dist > 0
        else 0.0
    )

    at_poi = (
        zone["bottom"] <= close <= zone["top"]
        or abs(close - zone["top"]) <= atr * 1.5
        or abs(close - zone["bottom"]) <= atr * 1.5
    )
    at_poi_score = _AT_POI_BONUS if at_poi else 0.0

    liq_score = _liq_bonus(zone, liq_signals, atr)

    total = type_score + proximity_score + at_poi_score + liq_score

    return {
        **zone,
        "score": round(total, 2),
        "score_breakdown": {
            "type": type_score,
            "proximity": round(proximity_score, 2),
            "at_poi": at_poi_score,
            "liquidity": liq_score,
            "cluster": 0.0,
        },
        "cluster_size": 1,
        "confluence_types": [zone["source_type"]],
    }


def _liq_bonus(zone: Zone, liq_signals: list[dict], atr: float) -> float:
    """
    Award the liquidity bonus when an unswept pool in the same direction
    sits within 1 ATR of either edge of the zone.  One bonus per zone max.
    """
    for liq in liq_signals:
        if liq.get("swept"):
            continue
        if liq.get("direction") != zone["direction"]:
            continue
        liq_price = liq.get("price", 0.0)
        if (
            abs(liq_price - zone["top"]) <= atr
            or abs(liq_price - zone["bottom"]) <= atr
        ):
            return _LIQ_BONUS
    return 0.0
