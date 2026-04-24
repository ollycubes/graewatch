"""
Unit tests for engine/zone_scoring.py — score_zone().

These tests pin down the scoring contract: type base scores, proximity decay,
at-POI bonus, and the liquidity bonus (direction- and proximity-gated).
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.zone_scoring import score_zone


def _ctx(close: Decimal, atr: Decimal) -> dict:
    return {
        "bias": "bullish",
        "htf_bias_source": "current_bos",
        "current_close": close,
        "atr": atr,
        "htf_interval": None,
    }


def _zone(source_type: str, top: Decimal, bottom: Decimal, direction: str = "bullish") -> dict:
    return {
        "source_type": source_type,
        "direction": direction,
        "top": top,
        "bottom": bottom,
        "timestamp": 0,
        "end_timestamp": None,
    }


# ── type base ────────────────────────────────────────────────────────────────


def test_type_base_scores_match_constants():
    """wyckoff (30) > ob (20) > fvg (10) at identical zone geometry."""
    # Place zone far away so proximity and at-POI don't interfere.
    far_top, far_bot = Decimal("100.0"), Decimal("99.9")
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))

    wy = score_zone(_zone("wyckoff", far_top, far_bot), ctx, [])
    ob = score_zone(_zone("ob", far_top, far_bot), ctx, [])
    fvg = score_zone(_zone("fvg", far_top, far_bot), ctx, [])

    assert wy["score_breakdown"]["type"] == Decimal("30.0")
    assert ob["score_breakdown"]["type"] == Decimal("20.0")
    assert fvg["score_breakdown"]["type"] == Decimal("10.0")


def test_unknown_source_type_gets_zero_type_score():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))
    score = score_zone(_zone("mystery", Decimal("100"), Decimal("99")), ctx, [])
    assert score["score_breakdown"]["type"] == Decimal("0.0")


# ── proximity ────────────────────────────────────────────────────────────────


def test_proximity_is_max_when_price_sits_inside_zone():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))
    s = score_zone(_zone("fvg", Decimal("1.05"), Decimal("0.95")), ctx, [])
    # dist = 0 → full 25.0 proximity.
    assert s["score_breakdown"]["proximity"] == Decimal("25.0")


def test_proximity_is_zero_past_max_dist():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))
    # max_dist = 5 * 0.1 = 0.5 → place mid at 2.0 (distance 1.0).
    s = score_zone(_zone("fvg", Decimal("2.05"), Decimal("1.95")), ctx, [])
    assert s["score_breakdown"]["proximity"] == Decimal("0.0")


def test_proximity_decays_linearly_between_zero_and_max():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))
    # Zone mid = 1.25, dist = 0.25, max_dist = 0.5 → proximity = 25 * 0.5 = 12.5.
    s = score_zone(_zone("fvg", Decimal("1.30"), Decimal("1.20")), ctx, [])
    assert s["score_breakdown"]["proximity"] == Decimal("12.5")


# ── at-POI bonus ─────────────────────────────────────────────────────────────


def test_at_poi_bonus_when_close_inside_zone():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.1"))
    s = score_zone(_zone("fvg", Decimal("1.05"), Decimal("0.95")), ctx, [])
    assert s["score_breakdown"]["at_poi"] == Decimal("15.0")


def test_at_poi_bonus_when_close_within_1_5_atr_of_edge():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    # Zone top = 1.10; close = 1.0; distance = 0.10 = 1 ATR < 1.5 ATR.
    s = score_zone(_zone("fvg", Decimal("1.10"), Decimal("1.05")), ctx, [])
    assert s["score_breakdown"]["at_poi"] == Decimal("15.0")


def test_at_poi_absent_when_price_far_from_zone():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    # 2.0 is 10 ATR above the zone top.
    s = score_zone(_zone("fvg", Decimal("2.10"), Decimal("2.00")), ctx, [])
    assert s["score_breakdown"]["at_poi"] == Decimal("0.0")


# ── liquidity bonus ──────────────────────────────────────────────────────────


def test_liq_bonus_applies_when_unswept_pool_matches_direction_and_is_close():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    zone = _zone("fvg", Decimal("1.20"), Decimal("1.10"))
    liq = [{"direction": "bullish", "swept": False, "price": Decimal("1.15")}]
    s = score_zone(zone, ctx, liq)
    assert s["score_breakdown"]["liquidity"] == Decimal("15.0")


def test_liq_bonus_ignores_swept_pools():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    zone = _zone("fvg", Decimal("1.20"), Decimal("1.10"))
    liq = [{"direction": "bullish", "swept": True, "price": Decimal("1.15")}]
    s = score_zone(zone, ctx, liq)
    assert s["score_breakdown"]["liquidity"] == Decimal("0.0")


def test_liq_bonus_ignores_opposite_direction_pools():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    zone = _zone("fvg", Decimal("1.20"), Decimal("1.10"), direction="bullish")
    liq = [{"direction": "bearish", "swept": False, "price": Decimal("1.15")}]
    s = score_zone(zone, ctx, liq)
    assert s["score_breakdown"]["liquidity"] == Decimal("0.0")


def test_liq_bonus_requires_pool_within_1_atr_of_zone_edge():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    zone = _zone("fvg", Decimal("1.20"), Decimal("1.10"))
    # 2 ATR above top, 2 ATR below bottom → no bonus.
    liq = [{"direction": "bullish", "swept": False, "price": Decimal("1.40")}]
    s = score_zone(zone, ctx, liq)
    assert s["score_breakdown"]["liquidity"] == Decimal("0.0")


def test_total_score_equals_sum_of_breakdown_components():
    ctx = _ctx(close=Decimal("1.0"), atr=Decimal("0.10"))
    zone = _zone("ob", Decimal("1.05"), Decimal("0.95"))
    liq = [{"direction": "bullish", "swept": False, "price": Decimal("1.00")}]
    s = score_zone(zone, ctx, liq)
    br = s["score_breakdown"]
    assert s["score"] == br["type"] + br["proximity"] + br["at_poi"] + br["liquidity"]
