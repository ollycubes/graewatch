"""
Integration tests for engine/zones.py — detect_zones().

detect_zones() is the glue between the signal detectors, zone scoring,
clustering, and bias determination. The tests here fabricate upstream
signals directly rather than running the detectors end-to-end.
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.zones import detect_zones
from tests.conftest import make_candle


def _candles(price: float = 1.0, n: int = 30) -> list[dict]:
    """Gentle-wick candles so ATR > 0 and scoring doesn't divide by zero."""
    wick = price * 0.005
    return [make_candle(i, price, price + wick, price - wick, price) for i in range(n)]


def _bos(direction: str, swing_ref: float = 1.05) -> dict:
    return {"direction": direction, "swing_ref": Decimal(str(swing_ref)), "timestamp": 1}


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


# ── degenerate inputs ────────────────────────────────────────────────────────


def test_empty_candles_returns_neutral_empty_result():
    res = detect_zones(
        candles=[], bos_signals=[], fvg_signals=[], ob_signals=[], liq_signals=[]
    )
    assert res == {"bias": "neutral", "context": {}, "zones": []}


def test_neutral_bias_returns_no_zones_even_when_candidates_exist():
    """No BOS → bias = neutral → early return, even if FVGs/OBs present."""
    res = detect_zones(
        candles=_candles(),
        bos_signals=[],
        fvg_signals=[_fvg("bullish", 1.02, 0.98)],
        ob_signals=[_ob("bullish", 1.02, 0.98)],
        liq_signals=[],
    )
    assert res["bias"] == "neutral"
    assert res["zones"] == []


# ── bias-filtering of candidates ─────────────────────────────────────────────


def test_only_zones_matching_bias_are_included():
    """Bullish bias → bearish FVGs/OBs get dropped."""
    res = detect_zones(
        candles=_candles(),
        bos_signals=[_bos("bullish")],
        fvg_signals=[
            _fvg("bullish", 1.02, 0.99),
            _fvg("bearish", 1.10, 1.05),
        ],
        ob_signals=[
            _ob("bearish", 1.20, 1.15),
        ],
        liq_signals=[],
    )
    assert res["bias"] == "bullish"
    for z in res["zones"]:
        assert z["direction"] == "bullish"
    sources = {z["source_type"] for z in res["zones"]}
    # Only the bullish FVG survives; bearish OB and bearish FVG are dropped.
    assert "fvg" in sources
    assert "ob" not in sources


def test_mitigated_zones_are_dropped():
    """Signals with end_timestamp set are considered mitigated and excluded."""
    res = detect_zones(
        candles=_candles(),
        bos_signals=[_bos("bullish")],
        fvg_signals=[
            _fvg("bullish", 1.02, 0.99),
            _fvg("bullish", 1.04, 1.03, end=5),  # mitigated
        ],
        ob_signals=[_ob("bullish", 1.05, 1.04, end=7)],  # mitigated
        liq_signals=[],
    )
    # Exactly one surviving FVG; no OB zones.
    sources = [z["source_type"] for z in res["zones"]]
    assert sources.count("fvg") == 1
    assert "ob" not in sources


# ── context payload ──────────────────────────────────────────────────────────


def test_context_reports_current_close_and_bias_source():
    candles = _candles(price=1.0)
    res = detect_zones(
        candles=candles,
        bos_signals=[_bos("bullish")],
        fvg_signals=[_fvg("bullish", 1.02, 0.99)],
        ob_signals=[],
        liq_signals=[],
    )
    ctx = res["context"]
    assert ctx["bias"] == "bullish"
    assert ctx["current_close"] == candles[-1]["close"]
    assert ctx["htf_bias_source"] == "current_bos"


def test_context_reports_htf_bos_source_when_htf_signals_present():
    res = detect_zones(
        candles=_candles(),
        bos_signals=[_bos("bullish")],
        htf_bos_signals=[_bos("bullish")],
        fvg_signals=[_fvg("bullish", 1.02, 0.99)],
        ob_signals=[],
        liq_signals=[],
    )
    assert res["context"]["htf_bias_source"] == "htf_bos"


# ── zone output shape ────────────────────────────────────────────────────────


def test_zones_are_sorted_by_score_desc_and_carry_breakdown():
    """Each returned zone has a score and breakdown; list is score-ordered."""
    res = detect_zones(
        candles=_candles(price=1.0, n=30),
        bos_signals=[_bos("bullish")],
        fvg_signals=[
            _fvg("bullish", 1.005, 0.995),  # at-price
            _fvg("bullish", 1.80, 1.70),    # far away
        ],
        ob_signals=[_ob("bullish", 1.003, 0.997)],
        liq_signals=[],
    )
    assert res["zones"]
    scores = [z["score"] for z in res["zones"]]
    assert scores == sorted(scores, reverse=True)
    for z in res["zones"]:
        assert "score_breakdown" in z
        assert set(z["score_breakdown"]).issuperset(
            {"type", "proximity", "at_poi", "liquidity", "cluster"}
        )
