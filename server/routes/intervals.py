from __future__ import annotations

INTERVAL_ALIASES = { # These are the rules
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

TWELVE_DATA_INTERVAL_MAP = { # Different ways its referred in twelvedata
    "daily": "1day",
    "1h": "1h",
    "4h": "4h",
    "weekly": "1week",
    "15min": "15min",
}

SUPPORTED_INTERVALS = tuple(TWELVE_DATA_INTERVAL_MAP.keys())

# We either churn and return the time value ot not here
def normalize_interval(value: str) -> str | None:
    if not value:
        return None
    return INTERVAL_ALIASES.get(value.strip().lower())


# After nomalisation, my values are then used in the candles.py or analysis.py routes