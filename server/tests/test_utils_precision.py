"""
Unit tests for utils/precision.py — Decimal helpers used across the engines.
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.precision import convert_candles_to_decimal, convert_to_float, to_decimal


# ── to_decimal ───────────────────────────────────────────────────────────────


def test_to_decimal_handles_none_as_zero():
    assert to_decimal(None) == Decimal("0")


def test_to_decimal_preserves_float_precision_via_string():
    """
    Converting via str(val) avoids the binary-float representation errors you
    get from Decimal(float). Critical for price math.
    """
    assert to_decimal(0.1) == Decimal("0.1")
    assert to_decimal(1.234567) == Decimal("1.234567")


def test_to_decimal_accepts_string_and_int():
    assert to_decimal("1.05") == Decimal("1.05")
    assert to_decimal(42) == Decimal("42")


def test_to_decimal_passes_existing_decimal_through():
    assert to_decimal(Decimal("1.23")) == Decimal("1.23")


# ── convert_candles_to_decimal ───────────────────────────────────────────────


def test_convert_candles_to_decimal_converts_price_fields():
    candles = [
        {"timestamp": 1, "open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05, "extra": "x"}
    ]
    out = convert_candles_to_decimal(candles)
    c = out[0]
    for key in ("open", "high", "low", "close"):
        assert isinstance(c[key], Decimal)
    assert c["extra"] == "x"
    assert c["timestamp"] == 1


def test_convert_candles_to_decimal_does_not_mutate_input():
    candles = [{"timestamp": 0, "open": 1, "high": 1, "low": 1, "close": 1}]
    convert_candles_to_decimal(candles)
    # Original prices unchanged (still ints, not Decimals).
    assert not isinstance(candles[0]["open"], Decimal)


# ── convert_to_float ─────────────────────────────────────────────────────────


def test_convert_to_float_converts_top_level_decimal():
    assert convert_to_float(Decimal("1.5")) == 1.5
    assert isinstance(convert_to_float(Decimal("1.5")), float)


def test_convert_to_float_walks_lists_and_dicts():
    data = {
        "top": Decimal("1.1"),
        "nested": {"bottom": Decimal("0.9"), "label": "x"},
        "list": [Decimal("2.2"), {"val": Decimal("3.3")}],
        "untouched": 7,
    }
    out = convert_to_float(data)
    assert out["top"] == 1.1
    assert out["nested"]["bottom"] == 0.9
    assert out["nested"]["label"] == "x"
    assert out["list"][0] == 2.2
    assert out["list"][1]["val"] == 3.3
    assert out["untouched"] == 7


def test_convert_to_float_passes_non_decimal_scalars_through():
    assert convert_to_float("hello") == "hello"
    assert convert_to_float(42) == 42
    assert convert_to_float(None) is None
    assert convert_to_float(True) is True
