"""
Unit tests for the prediction engine.

The engine combines up to 6 weighted votes:
  htf_bos (0.25), current_bos (0.20), nearest_fvg (0.15),
  nearest_ob (0.10), gann_position (0.20), recent_liq (0.10)

Key behaviours tested:
  - All signals agree  → high confidence in that direction
  - No signals          → neutral result
  - Mixed signals       → low confidence / neutral
  - Target range uses zone data when available, falls back to ATR
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.prediction import (
    predict,
    _neutral,
    _htf_bos_bias,
    _nearest_unmitigated_zone,
    _gann_bias,
    _compute_atr,
    WEIGHTS,
)
from tests.conftest import make_candle


# ── fixtures ──────────────────────────────────────────────────────────────────


def simple_candles(n: int = 20, close: float = 1.000) -> list[dict]:
    """Candles with a non-trivial range so ATR > 0."""
    candles = []
    for i in range(n):
        candles.append(make_candle(i, close, close + 0.005, close - 0.005, close))
    return candles


def unmitigated_fvg(direction: str, top: float, bottom: float) -> dict:
    return {"direction": direction, "top": top, "bottom": bottom, "end_timestamp": None}


def mitigated_fvg(direction: str, top: float, bottom: float) -> dict:
    return {"direction": direction, "top": top, "bottom": bottom, "end_timestamp": 99}


def gann_box(high_price: float, low_price: float) -> dict:
    return {
        "start_timestamp": 0,
        "end_timestamp": 10,
        "high_price": high_price,
        "low_price": low_price,
        "direction": "bullish",
    }


# ── WEIGHTS sanity check ──────────────────────────────────────────────────────


def test_weights_sum_to_one():
    total = sum(WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9, f"Weights sum to {total}, expected 1.0"


# ── predict() — basic structural tests ───────────────────────────────────────


def test_empty_candles_returns_neutral():
    result = predict([], [], [], [], [])
    assert result["direction"] == "neutral"
    assert result["confidence"] == 0


def test_result_has_required_fields():
    candles = simple_candles()
    result = predict(candles, [], [], [], [])
    for key in ("direction", "confidence", "target_high", "target_low", "current_close", "signals"):
        assert key in result, f"Missing key '{key}' in prediction result"


def test_current_close_matches_last_candle():
    candles = simple_candles(close=1.12345)
    result = predict(candles, [], [], [], [])
    assert result["current_close"] == round(1.12345, 5)


# ── predict() — directional signals ──────────────────────────────────────────


def test_all_bullish_signals_give_bullish_prediction():
    candles = simple_candles(close=1.000)
    # Gann box: price (1.000) below midpoint (1.010) → bullish
    gann = [gann_box(high_price=1.020, low_price=1.000)]
    # Current BOS bullish
    bos = [{"direction": "bullish", "timestamp": 15}]
    # HTF BOS bullish
    htf_bos = [{"direction": "bullish", "timestamp": 10}]
    # FVG bullish and unmitigated
    fvg = [unmitigated_fvg("bullish", top=1.005, bottom=0.999)]
    # OB bullish and unmitigated
    ob = [unmitigated_fvg("bullish", top=1.003, bottom=0.998)]
    # Liq sweep bullish
    liq = [{"direction": "bullish", "timestamp": 18}]

    result = predict(
        candles, bos, fvg, gann, ob,
        liq_signals=liq,
        htf_bos_signals=htf_bos,
    )
    assert result["direction"] == "bullish"
    assert result["confidence"] > 50


def test_all_bearish_signals_give_bearish_prediction():
    candles = simple_candles(close=1.020)
    # Gann box: price (1.020) above midpoint (1.010) → bearish
    gann = [gann_box(high_price=1.020, low_price=1.000)]
    bos = [{"direction": "bearish", "timestamp": 15}]
    htf_bos = [{"direction": "bearish", "timestamp": 10}]
    fvg = [unmitigated_fvg("bearish", top=1.015, bottom=1.010)]
    ob = [unmitigated_fvg("bearish", top=1.012, bottom=1.008)]
    liq = [{"direction": "bearish", "timestamp": 18}]

    result = predict(
        candles, bos, fvg, gann, ob,
        liq_signals=liq,
        htf_bos_signals=htf_bos,
    )
    assert result["direction"] == "bearish"
    assert result["confidence"] > 50


def test_no_signals_returns_neutral():
    candles = simple_candles()
    result = predict(candles, [], [], [], [])
    assert result["direction"] == "neutral"


def test_perfectly_split_signals_returns_neutral_or_low_confidence():
    """
    Exactly half bullish, half bearish → confidence should be 0 or neutral.
    Use htf_bos(bearish, 0.25) + current_bos(bullish, 0.20) + gann(bearish, 0.20) +
        nearest_fvg(bullish, 0.15) = equal-ish split.
    """
    candles = simple_candles(close=1.010)
    bos = [{"direction": "bullish", "timestamp": 15}]
    htf_bos = [{"direction": "bearish", "timestamp": 10}]
    gann = [gann_box(high_price=1.020, low_price=1.000)]  # price=1.010 = midpoint → bearish
    fvg = [unmitigated_fvg("bullish", top=1.015, bottom=1.005)]

    result = predict(candles, bos, fvg, gann, [], htf_bos_signals=htf_bos)
    # Either neutral or very low confidence
    assert result["direction"] == "neutral" or result["confidence"] < 15


# ── predict() — target range ──────────────────────────────────────────────────


def test_target_uses_fvg_zone_when_available():
    candles = simple_candles(close=1.000)
    bos = [{"direction": "bullish", "timestamp": 15}]
    fvg = [unmitigated_fvg("bullish", top=1.020, bottom=1.010)]
    gann = [gann_box(high_price=1.030, low_price=1.000)]  # discount → bullish
    htf_bos = [{"direction": "bullish", "timestamp": 5}]

    result = predict(candles, bos, fvg, gann, [], htf_bos_signals=htf_bos)
    if result["direction"] == "bullish":
        assert result["target_high"] == round(1.020, 5)


def test_target_falls_back_to_atr_when_no_zones():
    candles = simple_candles(close=1.000)
    bos = [{"direction": "bullish", "timestamp": 15}]
    htf_bos = [{"direction": "bullish", "timestamp": 5}]
    gann = [gann_box(high_price=1.020, low_price=1.000)]  # discount → bullish

    result = predict(candles, bos, [], gann, [], htf_bos_signals=htf_bos)
    if result["direction"] == "bullish":
        # ATR-based: target_high = close + ATR > close
        assert result["target_high"] > result["current_close"]


# ── Helper function unit tests ────────────────────────────────────────────────


def test_neutral_helper():
    result = _neutral(1.23456, {})
    assert result["direction"] == "neutral"
    assert result["confidence"] == 0
    assert result["current_close"] == round(1.23456, 5)


def test_neutral_helper_zero_close():
    result = _neutral(0.0, {})
    assert result["target_high"] == 0
    assert result["target_low"] == 0


def test_htf_bos_bias_returns_last_direction():
    signals = [{"direction": "bearish"}, {"direction": "bullish"}]
    assert _htf_bos_bias(signals) == "bullish"


def test_htf_bos_bias_none_on_empty():
    assert _htf_bos_bias([]) is None
    assert _htf_bos_bias(None) is None


def test_nearest_unmitigated_zone_ignores_mitigated():
    zones = [
        mitigated_fvg("bullish", top=1.005, bottom=1.000),
        unmitigated_fvg("bullish", top=1.010, bottom=1.008),
    ]
    result = _nearest_unmitigated_zone(zones, current_close=1.000)
    # Only the unmitigated one should be returned
    assert result is not None
    assert result["top"] == 1.010


def test_nearest_unmitigated_zone_picks_closest_midpoint():
    zones = [
        unmitigated_fvg("bullish", top=1.100, bottom=1.090),  # mid=1.095, far
        unmitigated_fvg("bullish", top=1.010, bottom=1.008),  # mid=1.009, close
    ]
    result = _nearest_unmitigated_zone(zones, current_close=1.000)
    assert result["top"] == 1.010


def test_nearest_unmitigated_zone_none_when_all_mitigated():
    zones = [mitigated_fvg("bullish", top=1.010, bottom=1.005)]
    assert _nearest_unmitigated_zone(zones, current_close=1.000) is None


def test_nearest_unmitigated_zone_empty():
    assert _nearest_unmitigated_zone([], current_close=1.000) is None


def test_gann_bias_discount_is_bullish():
    """Price below midpoint → discount → bullish."""
    signals = [gann_box(high_price=1.020, low_price=1.000)]
    # midpoint = 1.010; price = 1.005 (below midpoint)
    assert _gann_bias(signals, current_close=1.005) == "bullish"


def test_gann_bias_premium_is_bearish():
    """Price above midpoint → premium → bearish."""
    signals = [gann_box(high_price=1.020, low_price=1.000)]
    # midpoint = 1.010; price = 1.015 (above midpoint)
    assert _gann_bias(signals, current_close=1.015) == "bearish"


def test_gann_bias_none_on_empty():
    assert _gann_bias([], current_close=1.000) is None


def test_compute_atr_returns_zero_for_one_candle():
    assert _compute_atr([make_candle(0, 1.0, 1.005, 0.995, 1.0)]) == 0.0


def test_compute_atr_basic():
    candles = [
        make_candle(0, 1.000, 1.000, 1.000, 1.000),
        make_candle(1, 1.000, 1.010, 0.990, 1.000),  # TR = 0.020
    ]
    assert abs(_compute_atr(candles, period=1) - 0.02) < 1e-10
