"""Shared interval normalization and provider mapping helpers."""

from __future__ import annotations


INTERVAL_ALIASES = {
    "weekly": "weekly",
    "1w": "weekly",
    "w": "weekly",
    "daily": "daily",
    "1d": "daily",
    "d": "daily",
    "4h": "4h",
    "240m": "4h",
    "240min": "4h",
    "1h": "1h",
    "60m": "1h",
    "60min": "1h",
    "15m": "15min",
    "15min": "15min",
}

TWELVE_DATA_INTERVAL_MAP = {
    "daily": "1day",
    "1h": "1h",
    "4h": "4h",
    "weekly": "1week",
    "15min": "15min",
}

SUPPORTED_INTERVALS = tuple(TWELVE_DATA_INTERVAL_MAP.keys())


def normalize_interval(value: str) -> str | None:
    if not value:
        return None
    return INTERVAL_ALIASES.get(value.strip().lower())
