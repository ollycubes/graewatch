"""
Integration tests for engine/setup.py — detect() trade setup builder.

setup.detect() combines bias, entry POI (via detect_zones), target, and stop.
These tests cover the bias logic, the no-setup early returns, the end-to-end
happy paths for bullish and bearish setups, and the at-POI flag.
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.setup import _determine_bias, detect
from tests.conftest import make_candle


def _candles(price: float = 1.0, n: int = 30) -> list[dict]:
    wick = price * 0.005
    return [make_candle(i, price, price + wick, price - wick, price) for i in range(n)]


def _bos(direction: str, swing_ref: float | None = None) -> dict:
    d: dict = {"direction": direction, "timestamp": 1}
    if swing_ref is not None:
        d["swing_ref"] = Decimal(str(swing_ref))
    return d


def _fvg(direction: str, top: float, bottom: float, end: int | None = None) -> dict:
    return {
        "direction": direction,
        "top": Decimal(str(top)),
        "bottom": Decimal(str(bottom)),
        "timestamp": 1,
        "end_timestamp": end,
    }


def _ob(direction: str, top: float, bottom: float, end: int | None = None) -> dict:
    return {
        "direction": direction,
        "top": Decimal(str(top)),
        "bottom": Decimal(str(bottom)),
        "timestamp": 1,
        "end_timestamp": end,
    }


# ── _determine_bias ──────────────────────────────────────────────────────────


def test_determine_bias_agreement_between_htf_and_current_bos():
    bias = _determine_bias(
        bos_signals=[_bos("bullish")],
        htf_bos_signals=[_bos("bullish")],
        htf_gann_signals=None,
        htf_candles=None,
    )
    assert bias == "bullish"


def test_determine_bias_disagreement_is_neutral():
    bias = _determine_bias(
        bos_signals=[_bos("bullish")],
        htf_bos_signals=[_bos("bearish")],
        htf_gann_signals=None,
        htf_candles=None,
    )
    assert bias == "neutral"


def test_determine_bias_falls_back_to_current_bos_when_no_htf():
    assert (
        _determine_bias([_bos("bearish")], None, None, None) == "bearish"
    )


def test_determine_bias_neutral_when_no_signals():
    assert _determine_bias([], None, None, None) == "neutral"


def test_determine_bias_htf_only_uses_gann_to_veto():
    """HTF BOS bullish + Gann bearish → neutral."""
    htf_candles = _candles(price=2.0)
    # Gann: high=2.0, low=1.0 → mid=1.5. Close=2.0 > mid → gann says bearish.
    gann = [{"high_price": Decimal("2.0"), "low_price": Decimal("1.0")}]
    bias = _determine_bias(
        bos_signals=[],
        htf_bos_signals=[_bos("bullish")],
        htf_gann_signals=gann,
        htf_candles=htf_candles,
    )
    assert bias == "neutral"


# ── no-setup early returns ───────────────────────────────────────────────────


def test_detect_returns_invalid_when_candles_empty():
    out = detect([], [], [], [], [])
    assert out["valid"] is False
    assert out["bias"] == "neutral"


def test_detect_returns_invalid_when_bias_is_neutral():
    out = detect(_candles(), [], [], [], [])
    assert out["valid"] is False
    assert out["bias"] == "neutral"


def test_detect_returns_invalid_when_no_zones_match_bias():
    out = detect(
        candles=_candles(),
        bos_signals=[_bos("bullish")],
        fvg_signals=[_fvg("bearish", 1.02, 0.99)],  # wrong direction
        ob_signals=[],
        liq_signals=[],
    )
    assert out["valid"] is False
    assert out["bias"] == "bullish"


def test_detect_returns_invalid_when_no_target_available():
    """Bias is bullish and there's a POI, but no opposing TP candidate."""
    out = detect(
        candles=_candles(price=1.0),
        bos_signals=[_bos("bullish")],  # no swing_ref, so no BOS target either
        fvg_signals=[_fvg("bullish", 1.005, 0.995)],
        ob_signals=[],
        liq_signals=[],
    )
    assert out["valid"] is False


# ── happy-path bullish setup ─────────────────────────────────────────────────


def test_detect_builds_bullish_setup_with_valid_geometry():
    """
    Bullish bias, entry POI near current price, opposing OB above as target.
    Expect valid=True, stop below entry, target above entry.
    """
    candles = _candles(price=1.0)
    out = detect(
        candles=candles,
        bos_signals=[_bos("bullish", swing_ref=1.15)],
        fvg_signals=[_fvg("bullish", 1.005, 0.995)],  # entry POI at/around 1.00
        ob_signals=[_ob("bearish", 1.10, 1.08)],      # opposing TP target
        liq_signals=[],
    )
    assert out["valid"] is True, out
    assert out["bias"] == "bullish"
    entry_mid = (out["entry_top"] + out["entry_bottom"]) / Decimal("2")
    assert out["target"] > entry_mid
    assert out["stop"] < out["entry_bottom"]
    assert out["risk_reward"] > 0


def test_detect_builds_bearish_setup_with_valid_geometry():
    candles = _candles(price=1.0)
    out = detect(
        candles=candles,
        bos_signals=[_bos("bearish", swing_ref=0.85)],
        fvg_signals=[_fvg("bearish", 1.005, 0.995)],  # entry POI near price
        ob_signals=[_ob("bullish", 0.92, 0.90)],      # opposing TP below
        liq_signals=[],
    )
    assert out["valid"] is True, out
    assert out["bias"] == "bearish"
    entry_mid = (out["entry_top"] + out["entry_bottom"]) / Decimal("2")
    assert out["target"] < entry_mid
    assert out["stop"] > out["entry_top"]
    assert out["risk_reward"] > 0


def test_at_poi_flag_true_when_price_sits_in_entry_zone():
    """Current close 1.00 is inside the entry POI [0.99, 1.01]."""
    out = detect(
        candles=_candles(price=1.0),
        bos_signals=[_bos("bullish", swing_ref=1.15)],
        fvg_signals=[_fvg("bullish", 1.01, 0.99)],
        ob_signals=[_ob("bearish", 1.10, 1.08)],
        liq_signals=[],
    )
    assert out["valid"] is True
    assert out["at_poi"] is True
