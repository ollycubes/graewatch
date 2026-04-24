"""
Unit tests for engine/zone_cluster.py — cluster_zones().

Verifies overlap merging, proximity (within 1 ATR) merging, cluster bonus,
confluence type aggregation, and result ordering by total score.
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.zone_cluster import cluster_zones


def _scored(
    source_type: str,
    top: Decimal,
    bottom: Decimal,
    score: Decimal,
) -> dict:
    return {
        "source_type": source_type,
        "direction": "bullish",
        "top": top,
        "bottom": bottom,
        "timestamp": 0,
        "end_timestamp": None,
        "score": score,
        "score_breakdown": {
            "type": Decimal("0"),
            "proximity": Decimal("0"),
            "at_poi": Decimal("0"),
            "liquidity": Decimal("0"),
            "cluster": Decimal("0"),
        },
        "cluster_size": 1,
        "confluence_types": [source_type],
    }


def test_empty_input_returns_empty_list():
    assert cluster_zones([], Decimal("0.1")) == []


def test_single_zone_is_returned_unchanged():
    z = _scored("fvg", Decimal("1.10"), Decimal("1.00"), Decimal("25"))
    out = cluster_zones([z], Decimal("0.1"))
    assert out == [z]


def test_overlapping_zones_are_merged():
    a = _scored("fvg", Decimal("1.10"), Decimal("1.00"), Decimal("30"))
    b = _scored("ob", Decimal("1.05"), Decimal("0.95"), Decimal("20"))
    out = cluster_zones([a, b], Decimal("0.01"))
    assert len(out) == 1
    merged = out[0]
    assert merged["top"] == Decimal("1.10")
    assert merged["bottom"] == Decimal("0.95")
    assert merged["cluster_size"] == 2
    assert set(merged["confluence_types"]) == {"fvg", "ob"}


def test_cluster_bonus_added_per_extra_zone():
    """2-zone cluster → +10 bonus; 3-zone → +20 bonus."""
    a = _scored("fvg", Decimal("1.10"), Decimal("1.00"), Decimal("30"))
    b = _scored("ob", Decimal("1.08"), Decimal("1.02"), Decimal("20"))
    out = cluster_zones([a, b], Decimal("0.01"))
    # sum of raw scores + cluster bonus of 10.
    assert out[0]["score"] == Decimal("60")
    assert out[0]["score_breakdown"]["cluster"] == Decimal("10.0")

    c = _scored("wyckoff", Decimal("1.09"), Decimal("1.01"), Decimal("40"))
    out3 = cluster_zones([a, b, c], Decimal("0.01"))
    assert out3[0]["score"] == Decimal("30") + Decimal("20") + Decimal("40") + Decimal("20")
    assert out3[0]["score_breakdown"]["cluster"] == Decimal("20.0")


def test_proximity_merges_non_overlapping_zones_within_one_atr():
    """Non-overlapping zones whose midpoints are within 1 ATR are clustered."""
    a = _scored("fvg", Decimal("1.10"), Decimal("1.05"), Decimal("25"))  # mid=1.075
    b = _scored("ob", Decimal("1.00"), Decimal("0.95"), Decimal("20"))   # mid=0.975
    # |1.075 - 0.975| = 0.10; with ATR = 0.10 they merge.
    out = cluster_zones([a, b], Decimal("0.10"))
    assert len(out) == 1
    assert out[0]["cluster_size"] == 2


def test_far_apart_zones_stay_separate():
    a = _scored("fvg", Decimal("1.10"), Decimal("1.05"), Decimal("25"))
    b = _scored("ob", Decimal("0.50"), Decimal("0.45"), Decimal("20"))
    out = cluster_zones([a, b], Decimal("0.01"))
    assert len(out) == 2


def test_output_sorted_by_score_descending():
    # Three independent zones, no clustering possible.
    z1 = _scored("fvg", Decimal("1.00"), Decimal("0.99"), Decimal("10"))
    z2 = _scored("fvg", Decimal("2.00"), Decimal("1.99"), Decimal("50"))
    z3 = _scored("fvg", Decimal("3.00"), Decimal("2.99"), Decimal("30"))
    out = cluster_zones([z1, z2, z3], Decimal("0.001"))
    scores = [z["score"] for z in out]
    assert scores == sorted(scores, reverse=True)
    assert out[0]["score"] == Decimal("50")


def test_merged_cluster_inherits_highest_score_zones_base_metadata():
    a = _scored("fvg", Decimal("1.10"), Decimal("1.00"), Decimal("10"))
    a["timestamp"] = 111
    b = _scored("ob", Decimal("1.05"), Decimal("0.95"), Decimal("50"))
    b["timestamp"] = 222
    out = cluster_zones([a, b], Decimal("0.01"))
    # Base = highest-score zone (b), so its timestamp survives.
    assert out[0]["timestamp"] == 222
