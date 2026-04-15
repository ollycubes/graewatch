"""
Unit tests for the Gann box detection engine.

A Gann box pairs consecutive opposite swing points:
  - swing low → swing high: bullish box (high_price=sh.price, low_price=sl.price)
  - swing high → swing low: bearish box (high_price=sh.price, low_price=sl.price)

N=3 lookback — same swing detection as BOS.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.gann import detect
from tests.conftest import make_candle, flat_candles


# ── helpers ──────────────────────────────────────────────────────────────────


def bullish_box_candles() -> list[dict]:
    """
    Swing low at index 6 (low=0.990), swing high at index 14 (high=1.010).
    Expect one bullish Gann box: low_price=0.990, high_price=1.010.
    25 candles so both swings have 3 candles on each side within the array.
    """
    candles = flat_candles(25, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.000, 0.990, 1.000)   # swing low
    candles[14] = make_candle(14, 1.000, 1.010, 1.000, 1.000)  # swing high
    return candles


def bearish_box_candles() -> list[dict]:
    """
    Swing high at index 6 (high=1.010), swing low at index 14 (low=0.990).
    Expect one bearish Gann box: high_price=1.010, low_price=0.990.
    """
    candles = flat_candles(25, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.010, 1.000, 1.000)   # swing high
    candles[14] = make_candle(14, 1.000, 1.000, 0.990, 1.000)  # swing low
    return candles


def two_boxes_candles() -> list[dict]:
    """
    Swing low at 5, swing high at 12, swing low at 19 → two boxes.
    """
    candles = flat_candles(30, price=1.000)
    candles[5] = make_candle(5, 1.000, 1.000, 0.990, 1.000)    # swing low 1
    candles[12] = make_candle(12, 1.000, 1.010, 1.000, 1.000)  # swing high
    candles[19] = make_candle(19, 1.000, 1.000, 0.985, 1.000)  # swing low 2
    return candles


# ── tests ─────────────────────────────────────────────────────────────────────


def test_empty_candles_returns_empty():
    assert detect([]) == []


def test_too_few_candles_returns_empty():
    assert detect(flat_candles(6)) == []


def test_flat_candles_produce_no_boxes():
    # No distinct swings in flat data
    assert detect(flat_candles(30)) == []


def test_bullish_box_detected():
    result = detect(bullish_box_candles())
    bullish = [b for b in result if b["direction"] == "bullish"]
    assert len(bullish) >= 1


def test_bullish_box_prices():
    result = detect(bullish_box_candles())
    box = next(b for b in result if b["direction"] == "bullish")
    assert box["low_price"] == 0.990
    assert box["high_price"] == 1.010


def test_bullish_box_start_timestamp_is_swing_low():
    """For a bullish box (low → high), start_timestamp is the swing low."""
    result = detect(bullish_box_candles())
    box = next(b for b in result if b["direction"] == "bullish")
    assert box["start_timestamp"] == 6   # swing low at index 6


def test_bullish_box_end_timestamp_is_swing_high():
    result = detect(bullish_box_candles())
    box = next(b for b in result if b["direction"] == "bullish")
    assert box["end_timestamp"] == 14  # swing high at index 14


def test_bearish_box_detected():
    result = detect(bearish_box_candles())
    bearish = [b for b in result if b["direction"] == "bearish"]
    assert len(bearish) >= 1


def test_bearish_box_prices():
    result = detect(bearish_box_candles())
    box = next(b for b in result if b["direction"] == "bearish")
    assert box["high_price"] == 1.010
    assert box["low_price"] == 0.990


def test_bearish_box_start_timestamp_is_swing_high():
    result = detect(bearish_box_candles())
    box = next(b for b in result if b["direction"] == "bearish")
    assert box["start_timestamp"] == 6   # swing high at index 6


def test_gann_box_fields():
    result = detect(bullish_box_candles())
    for box in result:
        for key in ("start_timestamp", "end_timestamp", "high_price", "low_price", "direction"):
            assert key in box, f"Missing key '{key}' in Gann box"


def test_multiple_boxes_detected():
    result = detect(two_boxes_candles())
    assert len(result) >= 2


def test_boxes_ordered_by_time():
    """Gann boxes should be ordered chronologically (by start_timestamp)."""
    result = detect(two_boxes_candles())
    timestamps = [b["start_timestamp"] for b in result]
    assert timestamps == sorted(timestamps)
