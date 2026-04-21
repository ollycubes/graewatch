from __future__ import annotations
from decimal import Decimal
from engine.zone_types import Context, ScoredZone, Zone

_TYPE_BASE: dict[str, Decimal] = {
    "wyckoff": Decimal("30.0"),
    "ob": Decimal("20.0"),
    "fvg": Decimal("10.0")
}
_PROXIMITY_MAX = Decimal("25.0")
_AT_POI_BONUS = Decimal("15.0")
_LIQ_BONUS = Decimal("15.0")
_MAX_DIST_ATR = Decimal("5.0")


def score_zone(zone: Zone, context: Context, liq_signals: list[dict]) -> ScoredZone:
    atr = context["atr"]
    close = context["current_close"]
    max_dist = atr * _MAX_DIST_ATR

    mid = (zone["top"] + zone["bottom"]) / Decimal("2")
    dist = abs(mid - close)

    type_score = _TYPE_BASE.get(zone["source_type"], Decimal("0.0"))

    proximity_score = (
        _PROXIMITY_MAX * max(Decimal("0.0"), Decimal("1.0") - dist / max_dist)
        if max_dist > 0
        else Decimal("0.0")
    )

    at_poi = (
        zone["bottom"] <= close <= zone["top"]
        or abs(close - zone["top"]) <= atr * Decimal("1.5")
        or abs(close - zone["bottom"]) <= atr * Decimal("1.5")
    )
    at_poi_score = _AT_POI_BONUS if at_poi else Decimal("0.0")

    liq_score = _liq_bonus(zone, liq_signals, atr)

    total = type_score + proximity_score + at_poi_score + liq_score

    return {
        **zone,
        "score": total,
        "score_breakdown": {
            "type": type_score,
            "proximity": proximity_score,
            "at_poi": at_poi_score,
            "liquidity": liq_score,
            "cluster": Decimal("0.0"),
        },
        "cluster_size": 1,
        "confluence_types": [zone["source_type"]],
    }


def _liq_bonus(zone: Zone, liq_signals: list[dict], atr: Decimal) -> Decimal:
    """
    Award the liquidity bonus when an unswept pool in the same direction
    sits within 1 ATR of either edge of the zone.
    """
    for liq in liq_signals:
        if liq.get("swept"):
            continue
        if liq.get("direction") != zone["direction"]:
            continue
        liq_price = liq.get("price", Decimal("0.0"))
        if (
            abs(liq_price - zone["top"]) <= atr
            or abs(liq_price - zone["bottom"]) <= atr
        ):
            return _LIQ_BONUS
    return Decimal("0.0")
