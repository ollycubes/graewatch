"""
Unit tests for the FVG (Fair Value Gap) detection engine.

A bullish FVG: candle[i-2].high < candle[i].low  (gap up)
A bearish FVG: candle[i-2].low  > candle[i].high (gap down)

The middle candle (i-1) is the impulse; its timestamp is recorded.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.fvg import detect
from tests.conftest import make_candle, flat_candles


# ── helpers ──────────────────────────────────────────────────────────────────


def bullish_fvg_candles() -> list[dict]:
    """
    5 candles forming exactly one bullish FVG:
      c0: high=1.000
      c1: impulse — high set to 1.010 so the i=3 triplet (c1,c2,c3) has
          c1.high (1.010) >= c3.low (1.007), preventing a second FVG.
      c2: low=1.005  →  c0.high (1.000) < c2.low (1.005)  =  gap up
    """
    return [
        make_candle(0, 1.000, 1.000, 0.999, 1.000),  # c0  high=1.000
        make_candle(1, 1.001, 1.010, 1.000, 1.002),  # c1 impulse  high=1.010
        make_candle(2, 1.005, 1.010, 1.005, 1.008),  # c2  low=1.005 > c0.high
        make_candle(3, 1.008, 1.010, 1.007, 1.009),
        make_candle(4, 1.009, 1.011, 1.008, 1.010),
    ]


def bearish_fvg_candles() -> list[dict]:
    """
    5 candles forming exactly one bearish FVG:
      c0: low=1.010
      c1: impulse — low set to 1.003 so the i=3 triplet (c1,c2,c3) has
          c1.low (1.003) <= c3.high (1.004), preventing a second FVG.
      c2: high=1.005  →  c0.low (1.010) > c2.high (1.005)  =  gap down
    """
    return [
        make_candle(0, 1.010, 1.010, 1.010, 1.010),  # c0  low=1.010
        make_candle(1, 1.008, 1.009, 1.003, 1.007),  # c1 impulse  low=1.003
        make_candle(2, 1.005, 1.005, 1.002, 1.003),  # c2  high=1.005 < c0.low
        make_candle(3, 1.003, 1.004, 1.001, 1.002),
        make_candle(4, 1.002, 1.003, 1.000, 1.001),
    ]


# ── tests ─────────────────────────────────────────────────────────────────────


def test_empty_candles_returns_empty():
    assert detect([]) == []


def test_too_few_candles_returns_empty():
    assert detect(flat_candles(2)) == []


def test_bullish_fvg_detected():
    result = detect(bullish_fvg_candles())
    bullish = [e for e in result if e["direction"] == "bullish"]
    assert len(bullish) == 1


def test_bullish_fvg_zone_values():
    result = detect(bullish_fvg_candles())
    fvg = next(e for e in result if e["direction"] == "bullish")
    # top = c2.low = 1.005, bottom = c0.high = 1.000
    assert fvg["top"] == 1.005
    assert fvg["bottom"] == 1.000


def test_bullish_fvg_timestamp_is_impulse_candle():
    result = detect(bullish_fvg_candles())
    fvg = next(e for e in result if e["direction"] == "bullish")
    assert fvg["timestamp"] == 1  # c1 (the middle/impulse candle)


def test_bearish_fvg_detected():
    result = detect(bearish_fvg_candles())
    bearish = [e for e in result if e["direction"] == "bearish"]
    assert len(bearish) == 1


def test_bearish_fvg_zone_values():
    result = detect(bearish_fvg_candles())
    fvg = next(e for e in result if e["direction"] == "bearish")
    # top = c0.low = 1.010, bottom = c2.high = 1.005
    assert fvg["top"] == 1.010
    assert fvg["bottom"] == 1.005


def test_bearish_fvg_timestamp_is_impulse_candle():
    result = detect(bearish_fvg_candles())
    fvg = next(e for e in result if e["direction"] == "bearish")
    assert fvg["timestamp"] == 1


def test_flat_candles_produce_no_fvg():
    # No gap in perfectly flat data
    assert detect(flat_candles(10)) == []


def test_fvg_event_fields():
    for fvg in detect(bullish_fvg_candles()):
        for key in ("timestamp", "end_timestamp", "direction", "top", "bottom"):
            assert key in fvg, f"Missing key '{key}' in FVG event"


def test_bullish_fvg_mitigated_when_price_enters_gap():
    """
    After the gap is formed at candle 2 (top=1.005), add a candle whose low
    dips into the gap zone (low <= 1.005).
    """
    candles = bullish_fvg_candles()
    # Candle 3 dips into the gap
    candles[3] = make_candle(3, 1.008, 1.009, 1.004, 1.006)
    result = detect(candles)
    fvg = next(e for e in result if e["direction"] == "bullish")
    assert fvg["end_timestamp"] == 3  # mitigated at candle 3


def test_bullish_fvg_unmitigated_when_price_stays_above():
    """If no later candle dips into the gap, end_timestamp should be None."""
    result = detect(bullish_fvg_candles())
    fvg = next(e for e in result if e["direction"] == "bullish")
    assert fvg["end_timestamp"] is None


def test_bearish_fvg_mitigated_when_price_enters_gap():
    candles = bearish_fvg_candles()
    # Candle 3 bounces up into the gap (high >= 1.005)
    candles[3] = make_candle(3, 1.003, 1.006, 1.002, 1.005)
    result = detect(candles)
    fvg = next(e for e in result if e["direction"] == "bearish")
    assert fvg["end_timestamp"] == 3
