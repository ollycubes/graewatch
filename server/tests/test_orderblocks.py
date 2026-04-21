"""
Unit tests for the Order Block (OB) detection engine.

OB rules:
  - Bullish OB: last bearish candle (close < open) before a bullish BOS
    Zone: bottom = ob_candle.open, top = ob_candle.high
  - Bearish OB: last bullish candle (close > open) before a bearish BOS
    Zone: top = ob_candle.open, bottom = ob_candle.low

N=3 swing lookback — same confirmation timing as BOS tests.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.orderblocks import detect, _find_last_opposing_candle, _find_mitigation
from utils.precision import convert_to_float
from tests.conftest import make_candle, flat_candles


# ── helpers ──────────────────────────────────────────────────────────────────


def bullish_ob_scenario() -> list[dict]:
    """
    Build candles that produce a bullish OB with no premature mitigation.

    Base price 1.020 (above the OB zone top 1.017) so flat candles after
    the BOS have low=1.020 > 1.017 and do NOT trigger mitigation.

    Layout:
      - Swing high at index 6 (high=1.030)
      - Bearish OB candle at index 13: open=1.015, high=1.017 → zone 1.015–1.017
      - Bullish BOS at index 15: close=1.031 (above swing high 1.030)
    """
    candles = flat_candles(20, price=1.020)
    # Swing high — clearly above base price
    candles[6] = make_candle(6, 1.020, 1.030, 1.020, 1.020)
    # Bearish OB candle: open=1.015 > close=1.013 (bearish), high=1.017
    # Zone: bottom=open=1.015, top=high=1.017
    candles[13] = make_candle(13, 1.015, 1.017, 1.012, 1.013)
    # BOS candle — close above swing high 1.030
    candles[15] = make_candle(15, 1.013, 1.032, 1.013, 1.031)
    return candles


def bearish_ob_scenario() -> list[dict]:
    """
    Build candles that produce a bearish OB.

    Layout:
      - Swing low at index 6 (low=0.990)
      - Bullish candle (the OB) at index 13: open=0.995, close=0.998
      - Bearish BOS at index 15: close=0.989  (below swing low 0.990)
    """
    candles = flat_candles(20, price=1.000)
    candles[6] = make_candle(6, 1.000, 1.000, 0.990, 1.000)   # swing low
    candles[13] = make_candle(13, 0.995, 0.999, 0.994, 0.998)  # bullish candle (OB)
    candles[15] = make_candle(15, 0.998, 0.998, 0.987, 0.989)  # bearish BOS
    return candles


# ── convert_to_float(detect()) tests ────────────────────────────────────────────────────────────


def test_empty_candles_returns_empty():
    assert convert_to_float(detect([])) == []


def test_too_few_candles_returns_empty():
    assert convert_to_float(detect(flat_candles(6))) == []


def test_bullish_ob_detected():
    result = convert_to_float(detect(bullish_ob_scenario()))
    bullish = [ob for ob in result if ob["direction"] == "bullish"]
    assert len(bullish) >= 1


def test_bullish_ob_zone_open_to_high():
    """Bullish OB zone: bottom = OB candle's open, top = OB candle's high."""
    result = convert_to_float(detect(bullish_ob_scenario()))
    ob = next(o for o in result if o["direction"] == "bullish")
    # OB candle at index 13: open=1.015, high=1.017
    assert ob["bottom"] == 1.015
    assert ob["top"] == 1.017


def test_bearish_ob_detected():
    result = convert_to_float(detect(bearish_ob_scenario()))
    bearish = [ob for ob in result if ob["direction"] == "bearish"]
    assert len(bearish) >= 1


def test_bearish_ob_zone_low_to_open():
    """Bearish OB zone: top = OB candle's open, bottom = OB candle's low."""
    result = convert_to_float(detect(bearish_ob_scenario()))
    ob = next(o for o in result if o["direction"] == "bearish")
    # OB candle at index 13: open=0.995, low=0.994
    assert ob["top"] == 0.995
    assert ob["bottom"] == 0.994


def test_ob_event_fields():
    result = convert_to_float(detect(bullish_ob_scenario()))
    for ob in result:
        for key in ("timestamp", "end_timestamp", "direction", "top", "bottom"):
            assert key in ob, f"Missing key '{key}' in OB event"


def test_flat_candles_produce_no_ob():
    assert convert_to_float(detect(flat_candles(30))) == []


def test_bullish_ob_mitigated():
    """Add a candle after the BOS whose low dips into the OB zone."""
    candles = bullish_ob_scenario()
    # OB zone: bottom=1.015, top=1.017 — low=1.016 <= 1.017 enters the zone
    candles.append(make_candle(20, 1.020, 1.022, 1.016, 1.020))
    result = convert_to_float(convert_to_float(detect(candles)))
    ob = next(o for o in result if o["direction"] == "bullish")
    assert ob["end_timestamp"] == 20  # mitigated at the new candle


def test_bullish_ob_unmitigated():
    """No candle enters the zone — end_timestamp should be None."""
    result = convert_to_float(detect(bullish_ob_scenario()))
    ob = next(o for o in result if o["direction"] == "bullish")
    assert ob["end_timestamp"] is None


# ── _find_last_opposing_candle() unit tests ───────────────────────────────────


def test_find_last_bearish_candle():
    """Should find the last bearish (close < open) candle before bos_index."""
    candles = [
        make_candle(0, 1.000, 1.002, 0.999, 1.001),  # bullish
        make_candle(1, 1.002, 1.003, 1.000, 0.998),  # bearish ← target
        make_candle(2, 0.998, 1.005, 0.997, 1.004),  # bullish
        make_candle(3, 1.004, 1.006, 1.003, 1.005),  # bullish (BOS)
    ]
    result = _find_last_opposing_candle(candles, bos_index=3, direction="bearish", search_start=0)
    assert result is not None
    assert result["index"] == 1


def test_find_last_bullish_candle():
    candles = [
        make_candle(0, 1.000, 1.002, 0.999, 0.998),  # bearish
        make_candle(1, 0.998, 1.001, 0.997, 1.000),  # bullish ← target
        make_candle(2, 1.000, 1.001, 0.996, 0.995),  # bearish
        make_candle(3, 0.995, 0.996, 0.990, 0.989),  # bearish BOS
    ]
    result = _find_last_opposing_candle(candles, bos_index=3, direction="bullish", search_start=0)
    assert result is not None
    assert result["index"] == 1


def test_find_opposing_candle_returns_none_if_none_found():
    """All candles are bullish — no bearish candle exists."""
    candles = [make_candle(i, 1.0, 1.001, 0.999, 1.001) for i in range(5)]
    result = _find_last_opposing_candle(candles, bos_index=4, direction="bearish", search_start=0)
    assert result is None


# ── _find_mitigation() unit tests ─────────────────────────────────────────────


def test_find_mitigation_bullish_ob():
    """Bullish OB mitigated when a candle's low enters the zone (low <= top)."""
    candles = flat_candles(10, price=1.010)
    # Mitigation candle at index 7: low=1.006 enters zone top=1.007
    candles[7] = make_candle(7, 1.010, 1.012, 1.006, 1.009)
    ob = {"bos_index": 5, "direction": "bullish", "top": 1.007, "bottom": 1.005}
    ts = _find_mitigation(candles, ob)
    assert ts == 7


def test_find_mitigation_bearish_ob():
    """Bearish OB mitigated when a candle's high reaches into zone (high >= bottom)."""
    candles = flat_candles(10, price=0.990)
    # Mitigation candle at index 7: high=0.996 enters zone bottom=0.995
    candles[7] = make_candle(7, 0.990, 0.996, 0.989, 0.991)
    ob = {"bos_index": 5, "direction": "bearish", "top": 0.998, "bottom": 0.995}
    ts = _find_mitigation(candles, ob)
    assert ts == 7


def test_find_mitigation_returns_none_when_unmitigated():
    candles = flat_candles(10, price=1.010)
    ob = {"bos_index": 5, "direction": "bullish", "top": 1.007, "bottom": 1.005}
    # Price stays at 1.010, never dips to 1.007
    assert _find_mitigation(candles, ob) is None
