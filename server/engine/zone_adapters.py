from __future__ import annotations
from decimal import Decimal
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


def wyckoff_to_zone(signal: dict, atr: Decimal) -> Zone:
    """
    Wyckoff events mark a swept boundary level, not a range.
    We expand by ±0.5 ATR to create a zone.
    """
    level = signal["level"]
    return {
        "source_type": "wyckoff",
        "direction": signal["direction"],
        "top": level + atr * Decimal("0.5"),
        "bottom": level - atr * Decimal("0.5"),
        "timestamp": signal["timestamp"],
        "end_timestamp": None,
    }
