"""
Unit tests for the BOS (Break of Structure) detection engine.

N=3 swing lookback means:
  - A candle at index `i` is confirmed as a swing after `i + N` candles have
    been seen (the algorithm needs 3 candles on each side to confirm the swing).
  - The swing becomes "available" to trigger a BOS at index `i + N` in the
    scan loop (swings[j]["index"] <= i - N  →  i >= swing_index + N).

Test layout for a bullish BOS:
  - Swing high at index 6 (the peak candle)
  - Confirmed available at index 9 (6 + 3)
  - A closing candle above the swing high at index 15 triggers the BOS

For N=3, swing detection window is range(N, len-N) = range(3, len-3), so the
spike must be at index ≥ 3 and the candle list must be long enough.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.bos import detect
from tests.conftest import make_candle, flat_candles


# ── helpers ──────────────────────────────────────────────────────────────────


def bullish_bos_candles() -> list[dict]:
    """
    20 candles where a swing high at index 6 (price=1.010) is broken by a
    close of 1.011 at index 15.
    """
    candles = flat_candles(20, price=1.000)
    # spike high at index 6
    candles[6] = make_candle(6, 1.000, 1.010, 1.000, 1.000)
    # close above the swing high at index 15
    candles[15] = make_candle(15, 1.000, 1.012, 1.000, 1.011)
    return candles


def bearish_bos_candles() -> list[dict]:
    """
    20 candles where a swing low at index 6 (price=0.990) is broken by a
    close of 0.989 at index 15.
    """
    candles = flat_candles(20, price=1.000)
    # spike low at index 6
    candles[6] = make_candle(6, 1.000, 1.000, 0.990, 1.000)
    # close below the swing low at index 15
    candles[15] = make_candle(15, 1.000, 1.000, 0.988, 0.989)
    return candles


# ── tests ─────────────────────────────────────────────────────────────────────


def test_empty_candles_returns_empty():
    assert detect([]) == []


def test_too_few_candles_returns_empty():
    # Fewer than 2*N+1 = 7 candles → no swing can be confirmed
    assert detect(flat_candles(6)) == []


def test_bullish_bos_detected():
    candles = bullish_bos_candles()
    result = detect(candles)

    bullish = [e for e in result if e["direction"] == "bullish"]
    assert len(bullish) >= 1, "Expected at least one bullish BOS"

    bos = bullish[0]
    assert bos["direction"] == "bullish"
    assert bos["price"] > 1.010  # close was above the swing high
    assert bos["swing_ref"] == 1.010


def test_bullish_bos_timestamp_is_break_candle():
    candles = bullish_bos_candles()
    result = detect(candles)
    bullish = [e for e in result if e["direction"] == "bullish"]
    assert bullish[0]["timestamp"] == 15  # candle at index 15 caused the break


def test_bearish_bos_detected():
    candles = bearish_bos_candles()
    result = detect(candles)

    bearish = [e for e in result if e["direction"] == "bearish"]
    assert len(bearish) >= 1, "Expected at least one bearish BOS"

    bos = bearish[0]
    assert bos["direction"] == "bearish"
    assert bos["price"] < 0.990
    assert bos["swing_ref"] == 0.990


def test_bearish_bos_timestamp_is_break_candle():
    candles = bearish_bos_candles()
    result = detect(candles)
    bearish = [e for e in result if e["direction"] == "bearish"]
    assert bearish[0]["timestamp"] == 15


def test_flat_candles_produce_no_bos():
    # No swing highs or lows in perfectly flat data
    assert detect(flat_candles(30)) == []


def test_no_bos_when_break_candle_missing():
    """Swing high exists but price never closes above it."""
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.010, 1.000, 1.000)
    # No candle closes above 1.010
    result = detect(candles)
    bullish = [e for e in result if e["direction"] == "bullish"]
    assert bullish == []


def test_bos_event_fields():
    """Every BOS event must have the required keys."""
    candles = bullish_bos_candles()
    result = detect(candles)
    for event in result:
        for key in ("swing_timestamp", "timestamp", "direction", "price", "swing_ref"):
            assert key in event, f"Missing key '{key}' in BOS event"


def test_swing_reset_after_bos():
    """
    After a BOS, the same swing should not trigger a second BOS.
    Only one bullish BOS should be produced for the swing at index 6.
    """
    candles = bullish_bos_candles()
    # Add another high close after the break — should not produce a second BOS
    # from the same swing
    candles[16] = make_candle(16, 1.011, 1.015, 1.011, 1.012)
    result = detect(candles)
    bullish = [e for e in result if e["direction"] == "bullish"]
    # The swing was consumed; the second close is just a continuation, not a new BOS
    # (It might create a new BOS if a new swing high was formed, but not from index 6)
    swing_refs = [b["swing_ref"] for b in bullish]
    assert swing_refs.count(1.010) == 1, "Same swing should only trigger one BOS"
