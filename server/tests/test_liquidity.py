"""
Unit tests for the liquidity sweep detection engine.

Sweep rules:
  - Sweep above a swing high:  candle.high > swing.price AND candle.close < swing.price
    → direction = "bearish" (expected move after sweep)
  - Sweep below a swing low:   candle.low  < swing.price AND candle.close > swing.price
    → direction = "bullish"

Pool detection:
  - Two or more swings within ATR × 0.1 of each other are marked pool=True.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.liquidity import detect, _compute_atr, _mark_pools
from tests.conftest import make_candle, flat_candles


# ── helpers ──────────────────────────────────────────────────────────────────


def sweep_above_high_candles() -> list[dict]:
    """
    A swing high at index 6 (high=1.010) is swept by a candle at index 15
    whose wick goes to 1.012 but closes at 1.008 (below the swing).
    Expected: one bearish sweep event.
    """
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.010, 1.000, 1.000)   # swing high
    # Sweep candle: wick above 1.010, close below 1.010
    candles[15] = make_candle(15, 1.009, 1.012, 1.007, 1.008)
    return candles


def sweep_below_low_candles() -> list[dict]:
    """
    A swing low at index 6 (low=0.990) is swept by a candle at index 15
    whose wick goes to 0.987 but closes at 0.992 (above the swing).
    Expected: one bullish sweep event.
    """
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.000, 0.990, 1.000)   # swing low
    # Sweep candle: wick below 0.990, close above 0.990
    candles[15] = make_candle(15, 0.991, 0.993, 0.987, 0.992)
    return candles


def pool_scenario() -> list[dict]:
    """
    Two swing highs at nearly the same price level, forming a pool.
    Swing high 1: index 6 (high=1.010)
    Swing high 2: index 11 (high=1.0101) — within ATR×0.1 of 1.010

    ATR for 20 flat candles at 1.000 is ~0, so we need meaningful candle
    range. Use candles with a 0.005 range to get ATR ≈ 0.005.
    tolerance = 0.005 × 0.1 = 0.0005

    1.0101 - 1.010 = 0.0001 < 0.0005  →  pool
    """
    candles = []
    for i in range(20):
        candles.append(make_candle(i, 1.000, 1.005, 0.995, 1.000))
    # Two close swing highs
    candles[6] = make_candle(6, 1.000, 1.010, 0.995, 1.000)
    candles[11] = make_candle(11, 1.000, 1.0101, 0.995, 1.000)
    # Sweep the first swing high
    candles[17] = make_candle(17, 1.009, 1.012, 1.007, 1.008)
    return candles


# ── tests ─────────────────────────────────────────────────────────────────────


def test_empty_candles_returns_empty():
    assert detect([]) == []


def test_too_few_candles_returns_empty():
    assert detect(flat_candles(6)) == []


def test_sweep_above_high_is_bearish():
    result = detect(sweep_above_high_candles())
    bearish = [e for e in result if e["direction"] == "bearish"]
    assert len(bearish) >= 1


def test_sweep_above_high_price_is_swing_level():
    result = detect(sweep_above_high_candles())
    event = next(e for e in result if e["direction"] == "bearish")
    assert event["price"] == 1.010


def test_sweep_above_high_timestamp_is_sweep_candle():
    result = detect(sweep_above_high_candles())
    event = next(e for e in result if e["direction"] == "bearish")
    assert event["timestamp"] == 15


def test_sweep_below_low_is_bullish():
    result = detect(sweep_below_low_candles())
    bullish = [e for e in result if e["direction"] == "bullish"]
    assert len(bullish) >= 1


def test_sweep_below_low_price_is_swing_level():
    result = detect(sweep_below_low_candles())
    event = next(e for e in result if e["direction"] == "bullish")
    assert event["price"] == 0.990


def test_no_sweep_when_close_above_swept_high():
    """Wick above swing high but close also above — not a sweep."""
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.010, 1.000, 1.000)
    # Close above the swing high — NOT a sweep
    candles[15] = make_candle(15, 1.009, 1.012, 1.007, 1.011)
    result = detect(candles)
    bearish = [e for e in result if e["direction"] == "bearish" and e.get("swept", False)]
    assert bearish == []


def test_no_sweep_when_close_below_swept_low():
    """Wick below swing low but close also below — not a sweep."""
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.000, 0.990, 1.000)
    # Close below the swing low — NOT a sweep
    candles[15] = make_candle(15, 0.991, 0.993, 0.987, 0.988)
    result = detect(candles)
    bullish = [e for e in result if e["direction"] == "bullish" and e.get("swept", False)]
    assert bullish == []


def test_swept_level_removed_after_sweep():
    """Once a swing is swept, it should not produce a second event."""
    candles = sweep_above_high_candles()
    # Add a second candle that also wicks above 1.010 and closes below
    candles[16] = make_candle(16, 1.008, 1.013, 1.006, 1.007)
    result = detect(candles)
    bearish = [e for e in result if e["direction"] == "bearish" and e["price"] == 1.010]
    assert len(bearish) == 1  # swept level removed after first sweep


def test_event_fields():
    result = detect(sweep_above_high_candles())
    for event in result:
        for key in ("source_timestamp", "timestamp", "direction", "price", "pool"):
            assert key in event, f"Missing key '{key}' in liquidity event"


def test_pool_flag_on_equal_highs():
    result = detect(pool_scenario())
    swept = [e for e in result if e["direction"] == "bearish"]
    assert len(swept) >= 1
    # The swept level was part of a pool
    assert swept[0]["pool"] is True


def test_non_pool_sweep_has_pool_false():
    """Single isolated swing (no nearby duplicate) should not be marked pool."""
    result = detect(sweep_above_high_candles())
    event = next(e for e in result if e["direction"] == "bearish")
    assert event["pool"] is False


# ── _compute_atr() unit tests ─────────────────────────────────────────────────


def test_compute_atr_single_candle():
    candles = [make_candle(0, 1.000, 1.005, 0.995, 1.000)]
    assert _compute_atr(candles) == 0.0


def test_compute_atr_basic():
    """Two candles: TR = max(H-L, |H-prev_close|, |L-prev_close|)."""
    candles = [
        make_candle(0, 1.000, 1.000, 1.000, 1.000),
        make_candle(1, 1.000, 1.010, 0.990, 1.000),
    ]
    atr = _compute_atr(candles, period=1)
    assert abs(atr - 0.02) < 1e-10  # H-L = 1.010 - 0.990


# ── _mark_pools() unit tests ──────────────────────────────────────────────────


def test_mark_pools_marks_close_swings():
    swings = [{"price": 1.010}, {"price": 1.0101}]
    _mark_pools(swings, tolerance=0.001)
    assert swings[0].get("pool") is True
    assert swings[1].get("pool") is True


def test_mark_pools_does_not_mark_distant_swings():
    swings = [{"price": 1.010}, {"price": 1.020}]
    _mark_pools(swings, tolerance=0.001)
    assert swings[0].get("pool") is not True
    assert swings[1].get("pool") is not True


def test_mark_pools_zero_tolerance_does_nothing():
    swings = [{"price": 1.010}, {"price": 1.010}]
    _mark_pools(swings, tolerance=0)
    assert "pool" not in swings[0]
    assert "pool" not in swings[1]
