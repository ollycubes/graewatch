"""
Unit tests for the Wyckoff detection engine (springs & upthrusts).

Config reminders:
  MIN_RANGE_CANDLES = 12
  LOOKAHEAD         = 25
  RANGE_ATR_MULT    = 2.5    (seed consolidation ≤ 2.5 * ATR)
  EXTEND_ATR_MULT   = 3.5    (extended range ≤ 3.5 * ATR)
  TREND_LOOKBACK    = 15     (bars before range to infer phase)

ATR tuning
  ATR(14) is the mean TR of the last 14 candles. Our tail candles dominate
  this window, so we pick their wick size to land ATR inside the band where
  the consolidation (height = 0.02) *fits* as a range (≤ 2.5·ATR) but the
  spring/upthrust wick *does not* (so it doesn't get absorbed into the
  extended range; needs > 3.5·ATR from the opposite edge).

  With tail TR = 0.01 → ATR = 0.01:
    2.5·ATR = 0.025  ≥ 0.02  (consolidation seeds OK)
    3.5·ATR = 0.035  <  0.04 (spring/upthrust breaks out of extension)
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.wyckoff import (
    LOOKAHEAD,
    MIN_RANGE_CANDLES,
    TREND_LOOKBACK,
    detect,
)
from tests.conftest import make_candle


# ── helpers ──────────────────────────────────────────────────────────────────


def _range_candles(n: int, support: float, resistance: float, start_ts: int = 0) -> list[dict]:
    """n candles alternating between support and resistance (tight range)."""
    out: list[dict] = []
    height = resistance - support
    wick = height / 10.0
    for i in range(n):
        mid = support + (height / 2.0)
        if i % 2 == 0:
            out.append(
                make_candle(
                    start_ts + i,
                    open_=mid,
                    high=resistance,
                    low=mid - wick,
                    close=resistance - wick,
                )
            )
        else:
            out.append(
                make_candle(
                    start_ts + i,
                    open_=mid,
                    high=mid + wick,
                    low=support,
                    close=support + wick,
                )
            )
    return out


def _trend_down(n: int, start_price: float, step: float, start_ts: int = 0) -> list[dict]:
    """Descending candles giving an accumulation (downtrend) lead-in."""
    return [
        make_candle(
            start_ts + i,
            start_price - step * i,
            start_price - step * i + step / 4,
            start_price - step * i - step / 4,
            start_price - step * i,
        )
        for i in range(n)
    ]


def _trend_up(n: int, start_price: float, step: float, start_ts: int = 0) -> list[dict]:
    return [
        make_candle(
            start_ts + i,
            start_price + step * i,
            start_price + step * i + step / 4,
            start_price + step * i - step / 4,
            start_price + step * i,
        )
        for i in range(n)
    ]


def _wicky_tail(n: int, price: float, wick: float, start_ts: int = 0) -> list[dict]:
    """
    n candles with fixed wick on each side → TR(each) = 2·wick. Dominates
    ATR(14) so the whole test can be tuned to a single ATR target.
    """
    return [
        make_candle(start_ts + i, price, price + wick, price - wick, price)
        for i in range(n)
    ]


# Tail wick = 0.005 on each side → each TR ≈ 0.01 → ATR ≈ 0.01.
_TAIL_WICK = 0.005


# ── tests ────────────────────────────────────────────────────────────────────


def test_returns_empty_when_not_enough_candles():
    """Need MIN_RANGE_CANDLES + LOOKAHEAD = 37 candles minimum."""
    n = MIN_RANGE_CANDLES + LOOKAHEAD - 1
    candles = [make_candle(i, 1.0, 1.01, 0.99, 1.0) for i in range(n)]
    assert detect(candles) == []


def test_returns_empty_when_no_price_movement():
    """Completely flat candles → ATR = 0 → early return []."""
    n = MIN_RANGE_CANDLES + LOOKAHEAD + 10
    candles = [make_candle(i, 1.0, 1.0, 1.0, 1.0) for i in range(n)]
    assert detect(candles) == []


def test_detects_spring_below_consolidation_range():
    """
    Accumulation (downtrend lead-in) → consolidation → spring below support.
    Spring wicks below support but closes back inside the range.
    """
    lead_in = _trend_down(TREND_LOOKBACK + 5, start_price=1.20, step=0.01)
    range_start_ts = len(lead_in)

    consolidation = _range_candles(
        MIN_RANGE_CANDLES, support=1.00, resistance=1.02, start_ts=range_start_ts
    )
    post_ts = range_start_ts + MIN_RANGE_CANDLES

    # Spring: low = 0.98 (extended range would be 0.04 > 3.5·ATR = 0.035),
    # close = 1.01 back inside.
    spring_candle = make_candle(post_ts, open_=1.01, high=1.015, low=0.98, close=1.01)
    tail = _wicky_tail(LOOKAHEAD + 2, price=1.01, wick=_TAIL_WICK, start_ts=post_ts + 1)

    candles = lead_in + consolidation + [spring_candle] + tail
    signals = detect(candles)

    springs = [s for s in signals if s["type"] == "spring"]
    assert springs, f"expected at least one spring, got {signals}"
    s = springs[0]
    assert s["direction"] == "bullish"
    assert s["timestamp"] == post_ts
    assert s["level"] == Decimal("1.00")


def test_detects_upthrust_above_consolidation_range():
    """Distribution (uptrend lead-in) → consolidation → upthrust above resistance."""
    lead_in = _trend_up(TREND_LOOKBACK + 5, start_price=0.80, step=0.01)
    range_start_ts = len(lead_in)

    consolidation = _range_candles(
        MIN_RANGE_CANDLES, support=1.00, resistance=1.02, start_ts=range_start_ts
    )
    post_ts = range_start_ts + MIN_RANGE_CANDLES

    upthrust_candle = make_candle(
        post_ts, open_=1.01, high=1.04, low=1.005, close=1.01
    )
    tail = _wicky_tail(LOOKAHEAD + 2, price=1.01, wick=_TAIL_WICK, start_ts=post_ts + 1)

    candles = lead_in + consolidation + [upthrust_candle] + tail
    signals = detect(candles)

    upthrusts = [s for s in signals if s["type"] == "upthrust"]
    assert upthrusts, f"expected at least one upthrust, got {signals}"
    u = upthrusts[0]
    assert u["direction"] == "bearish"
    assert u["timestamp"] == post_ts
    assert u["level"] == Decimal("1.02")


def test_no_signal_when_range_is_not_broken_within_lookahead():
    """Consolidation followed by in-range tail emits nothing."""
    lead_in = _trend_down(TREND_LOOKBACK + 5, start_price=1.20, step=0.01)
    range_start_ts = len(lead_in)
    consolidation = _range_candles(
        MIN_RANGE_CANDLES, support=1.00, resistance=1.02, start_ts=range_start_ts
    )
    post_ts = range_start_ts + MIN_RANGE_CANDLES
    tail = _wicky_tail(LOOKAHEAD + 5, price=1.01, wick=_TAIL_WICK, start_ts=post_ts)

    assert detect(lead_in + consolidation + tail) == []


def test_wick_below_support_without_reclose_inside_range_is_not_a_spring():
    """Close at/below support = breakdown, not a spring."""
    lead_in = _trend_down(TREND_LOOKBACK + 5, start_price=1.20, step=0.01)
    range_start_ts = len(lead_in)
    consolidation = _range_candles(
        MIN_RANGE_CANDLES, support=1.00, resistance=1.02, start_ts=range_start_ts
    )
    post_ts = range_start_ts + MIN_RANGE_CANDLES

    broken = make_candle(post_ts, open_=1.00, high=1.00, low=0.98, close=0.99)
    tail = _wicky_tail(LOOKAHEAD + 2, price=0.99, wick=_TAIL_WICK, start_ts=post_ts + 1)

    signals = detect(lead_in + consolidation + [broken] + tail)
    assert not any(s["type"] == "spring" for s in signals)


def test_signal_carries_range_metadata():
    lead_in = _trend_down(TREND_LOOKBACK + 5, start_price=1.20, step=0.01)
    range_start_ts = len(lead_in)
    consolidation = _range_candles(
        MIN_RANGE_CANDLES, support=1.00, resistance=1.02, start_ts=range_start_ts
    )
    post_ts = range_start_ts + MIN_RANGE_CANDLES
    spring = make_candle(post_ts, 1.01, 1.015, 0.98, 1.01)
    tail = _wicky_tail(LOOKAHEAD + 2, 1.01, _TAIL_WICK, start_ts=post_ts + 1)

    signals = detect(lead_in + consolidation + [spring] + tail)
    springs = [s for s in signals if s["type"] == "spring"]
    assert springs
    s = springs[0]
    for key in (
        "range_start",
        "range_end",
        "range_support",
        "range_resistance",
        "phase",
    ):
        assert key in s
    # Range may extend slightly past the seed edges before the spring forces
    # a break; assert edges are within a reasonable band of the seed values.
    assert Decimal("0.98") < s["range_support"] <= Decimal("1.00")
    assert Decimal("1.02") <= s["range_resistance"] < Decimal("1.04")
