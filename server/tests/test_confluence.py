"""
Integration tests for engine/confluence.py — detect_confluence().

detect_confluence() merges per-TF zones and rewards lower-TF zones that
overlap higher-TF zones. These tests verify:
  - TF ordering & bias chain
  - The TF confluence bonus is applied when an HTF zone overlaps
  - Gann premium/discount bonus is applied in the correct half
  - Current-TF zone filtering by bias and TF_DETECTORS config
"""

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.confluence import (
    GANN_ZONE_BONUS,
    TF_CONFLUENCE_BONUS,
    TF_ORDER,
    detect_confluence,
)
from tests.conftest import make_candle


def _candles(price: float = 1.0, n: int = 30) -> list[dict]:
    wick = price * 0.005
    return [make_candle(i, price, price + wick, price - wick, price) for i in range(n)]


def _bos(direction: str, swing_ref: float = 1.2) -> dict:
    return {
        "direction": direction,
        "swing_ref": Decimal(str(swing_ref)),
        "timestamp": 1,
    }


def _fvg(direction: str, top: float, bottom: float) -> dict:
    return {
        "direction": direction,
        "top": Decimal(str(top)),
        "bottom": Decimal(str(bottom)),
        "timestamp": 1,
        "end_timestamp": None,
    }


def _ob(direction: str, top: float, bottom: float) -> dict:
    return {
        "direction": direction,
        "top": Decimal(str(top)),
        "bottom": Decimal(str(bottom)),
        "timestamp": 1,
        "end_timestamp": None,
    }


def _empty_tfs() -> dict[str, list[dict]]:
    return {tf: [] for tf in TF_ORDER}


# ── degenerate ───────────────────────────────────────────────────────────────


def test_empty_current_tf_returns_neutral_empty_result():
    out = detect_confluence(
        tf_candles={}, tf_bos={}, tf_fvg={}, tf_ob={},
        tf_liq={}, tf_wyckoff={}, tf_gann={}, current_tf="15min",
    )
    assert out == {"bias": "neutral", "bias_chain": {}, "context": {}, "zones": []}


# ── bias_chain ───────────────────────────────────────────────────────────────


def test_bias_chain_contains_every_tf_that_has_candles():
    tf_candles = {"15min": _candles(), "1h": _candles(), "daily": _candles()}
    tf_bos = {**_empty_tfs(), "15min": [_bos("bullish")]}
    out = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=_empty_tfs(),
        tf_ob=_empty_tfs(),
        tf_liq=_empty_tfs(),
        tf_wyckoff=_empty_tfs(),
        tf_gann=_empty_tfs(),
        current_tf="15min",
    )
    assert set(out["bias_chain"]) == {"15min", "1h", "daily"}


# ── TF confluence bonus ──────────────────────────────────────────────────────


def test_higher_tf_overlap_adds_tf_confluence_bonus():
    """
    15min FVG zone overlapping a daily OB zone receives the +20 daily bonus.
    (daily's TF_DETECTORS includes OB but not FVG, so we use an OB there.)
    """
    tf_candles = {"15min": _candles(), "daily": _candles()}
    tf_bos = {**_empty_tfs(), "15min": [_bos("bullish")], "daily": [_bos("bullish")]}

    tf_fvg = {**_empty_tfs(), "15min": [_fvg("bullish", 1.02, 0.99)]}
    tf_ob = {**_empty_tfs(), "daily": [_ob("bullish", 1.02, 0.99)]}

    out = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=tf_fvg,
        tf_ob=tf_ob,
        tf_liq=_empty_tfs(),
        tf_wyckoff=_empty_tfs(),
        tf_gann=_empty_tfs(),
        current_tf="15min",
    )
    assert out["bias"] == "bullish"
    assert out["zones"], "expected at least one zone"
    z = out["zones"][0]
    assert "daily" in z["tf_matches"]
    assert z["score_breakdown"]["tf_confluence"] >= TF_CONFLUENCE_BONUS["daily"]


def test_no_tf_bonus_when_higher_tf_zones_do_not_overlap():
    tf_candles = {"15min": _candles(), "daily": _candles()}
    tf_bos = {**_empty_tfs(), "15min": [_bos("bullish")], "daily": [_bos("bullish")]}

    tf_fvg = {
        **_empty_tfs(),
        "15min": [_fvg("bullish", 1.02, 0.99)],
        "daily": [_fvg("bullish", 5.00, 4.90)],  # far from 15min zone
    }
    out = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=tf_fvg,
        tf_ob=_empty_tfs(),
        tf_liq=_empty_tfs(),
        tf_wyckoff=_empty_tfs(),
        tf_gann=_empty_tfs(),
        current_tf="15min",
    )
    assert out["zones"]
    z = out["zones"][0]
    assert "daily" not in z["tf_matches"]
    assert z["score_breakdown"]["tf_confluence"] == Decimal("0.0")


# ── Gann premium/discount bonus ──────────────────────────────────────────────


def test_gann_bonus_applied_when_zone_sits_in_discount_half_bullish_bias():
    """Bullish bias + zone below the Gann midpoint → +GANN_ZONE_BONUS."""
    tf_candles = {"15min": _candles(price=1.0), "4h": _candles(price=1.0)}
    tf_bos = {**_empty_tfs(), "15min": [_bos("bullish")], "4h": [_bos("bullish")]}
    tf_fvg = {**_empty_tfs(), "15min": [_fvg("bullish", 1.02, 0.99)]}
    # Gann: high=2.0, low=0.0 → mid=1.0. Zone mid ~1.005 — just above mid, so
    # for bullish bias we need zone_mid < mid → move Gann mid higher.
    tf_gann = {**_empty_tfs(), "4h": [{"high_price": Decimal("3.0"), "low_price": Decimal("1.0")}]}

    out = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=tf_fvg,
        tf_ob=_empty_tfs(),
        tf_liq=_empty_tfs(),
        tf_wyckoff=_empty_tfs(),
        tf_gann=tf_gann,
        current_tf="15min",
    )
    # Bias could be neutral if htf_bos + gann disagree; we expect bullish here
    # (both htf_bos and gann say bullish because close 1.0 < mid 2.0).
    assert out["bias"] == "bullish"
    z = out["zones"][0]
    assert "gann" in z["tf_matches"]
    assert z["score_breakdown"]["tf_confluence"] >= GANN_ZONE_BONUS


# ── detector config respected ────────────────────────────────────────────────


def test_zones_only_collected_per_TF_DETECTORS_config():
    """
    weekly TF has detectors ["fvg","orderblocks"] (no BOS). Providing a
    weekly BOS should not produce a zone by itself — only matching FVG/OB.
    """
    tf_candles = {"15min": _candles(), "weekly": _candles()}
    tf_bos = {
        **_empty_tfs(),
        "15min": [_bos("bullish")],
        "weekly": [_bos("bullish")],
    }
    tf_fvg = {
        **_empty_tfs(),
        "15min": [_fvg("bullish", 1.02, 0.99)],
        # no weekly FVG, no weekly OB → no weekly zone to overlap.
    }
    out = detect_confluence(
        tf_candles=tf_candles,
        tf_bos=tf_bos,
        tf_fvg=tf_fvg,
        tf_ob=_empty_tfs(),
        tf_liq=_empty_tfs(),
        tf_wyckoff=_empty_tfs(),
        tf_gann=_empty_tfs(),
        current_tf="15min",
    )
    assert out["zones"]
    # No weekly match since no weekly zones were collected.
    assert "weekly" not in out["zones"][0]["tf_matches"]
