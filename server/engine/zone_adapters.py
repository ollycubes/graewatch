"""
Adapter layer: converts existing signal dicts → Zone dicts.

These functions are pure transformations — they do not call any detector
and do not modify any signal.  All existing code is unchanged.
"""

from __future__ import annotations

from engine.zone_types import Zone


def fvg_to_zone(signal: dict) -> Zone:
    return {
        "source_type": "fvg",
        "direction": signal["direction"],
        "top": signal["top"],
        "bottom": signal["bottom"],
        "timestamp": signal["timestamp"],
        "end_timestamp": signal.get("end_timestamp"),
    }


def ob_to_zone(signal: dict) -> Zone:
    return {
        "source_type": "ob",
        "direction": signal["direction"],
        "top": signal["top"],
        "bottom": signal["bottom"],
        "timestamp": signal["timestamp"],
        "end_timestamp": signal.get("end_timestamp"),
    }


def wyckoff_to_zone(signal: dict, atr: float) -> Zone:
    """
    Wyckoff events mark a swept boundary level, not a range.
    We expand by ±0.5 ATR (same logic used in engine/setup.py) to create a zone.
    """
    level = signal["level"]
    return {
        "source_type": "wyckoff",
        "direction": signal["direction"],
        "top": round(level + atr * 0.5, 5),
        "bottom": round(level - atr * 0.5, 5),
        "timestamp": signal["timestamp"],
        "end_timestamp": None,  # wyckoff signals have no mitigation tracking
    }
