"""
Unit tests for engine/zone_adapters.py — signal-to-Zone conversion.
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.zone_adapters import fvg_to_zone, ob_to_zone, wyckoff_to_zone


def test_fvg_to_zone_preserves_edges_and_sets_source():
    signal = {
        "direction": "bullish",
        "top": Decimal("1.10"),
        "bottom": Decimal("1.05"),
        "timestamp": 100,
        "end_timestamp": None,
    }
    zone = fvg_to_zone(signal)
    assert zone["source_type"] == "fvg"
    assert zone["direction"] == "bullish"
    assert zone["top"] == Decimal("1.10")
    assert zone["bottom"] == Decimal("1.05")
    assert zone["timestamp"] == 100
    assert zone["end_timestamp"] is None


def test_fvg_to_zone_propagates_mitigation_timestamp():
    signal = {
        "direction": "bearish",
        "top": Decimal("2.0"),
        "bottom": Decimal("1.9"),
        "timestamp": 1,
        "end_timestamp": 42,
    }
    assert fvg_to_zone(signal)["end_timestamp"] == 42


def test_fvg_to_zone_defaults_end_timestamp_when_missing():
    signal = {
        "direction": "bullish",
        "top": Decimal("1.0"),
        "bottom": Decimal("0.9"),
        "timestamp": 1,
    }
    assert fvg_to_zone(signal)["end_timestamp"] is None


def test_ob_to_zone_sets_source_and_preserves_fields():
    signal = {
        "direction": "bearish",
        "top": Decimal("1.50"),
        "bottom": Decimal("1.40"),
        "timestamp": 200,
        "end_timestamp": None,
    }
    zone = ob_to_zone(signal)
    assert zone["source_type"] == "ob"
    assert zone["direction"] == "bearish"
    assert (zone["top"], zone["bottom"]) == (Decimal("1.50"), Decimal("1.40"))


def test_wyckoff_to_zone_expands_level_by_half_atr():
    atr = Decimal("0.10")
    signal = {
        "direction": "bullish",
        "level": Decimal("1.00"),
        "timestamp": 300,
    }
    zone = wyckoff_to_zone(signal, atr)
    assert zone["source_type"] == "wyckoff"
    assert zone["top"] == Decimal("1.05")
    assert zone["bottom"] == Decimal("0.95")
    assert zone["end_timestamp"] is None


def test_wyckoff_to_zone_with_zero_atr_collapses_to_level():
    signal = {"direction": "bearish", "level": Decimal("2.00"), "timestamp": 0}
    zone = wyckoff_to_zone(signal, Decimal("0"))
    assert zone["top"] == zone["bottom"] == Decimal("2.00")
