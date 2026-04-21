from __future__ import annotations
from datetime import datetime, timedelta

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

def normalize_interval(value: str) -> str | None:
    if not value:
        return None
    return INTERVAL_ALIASES.get(value.strip().lower())

HTF_MAP = {
    "15min": "1h",
    "1h": "4h",
    "4h": "daily",
    "daily": "weekly",
    "weekly": None,
}

def normalize_timestamp(dt_str: str, interval: str) -> str:
    """
    Ensure a timestamp string is snapped to the start of its interval
    and formatted consistently as 'YYYY-MM-DD HH:MM:SS'.
    """
    try:
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        dt = datetime.strptime(dt_str, "%Y-%m-%d")
    
    if interval == "15min":
        dt = dt.replace(minute=(dt.minute // 15) * 15, second=0, microsecond=0)
    elif interval == "1h":
        dt = dt.replace(minute=0, second=0, microsecond=0)
    elif interval == "4h":
        dt = dt.replace(hour=(dt.hour // 4) * 4, minute=0, second=0, microsecond=0)
    elif interval == "daily" or interval == "weekly":
        dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        
    return dt.strftime("%Y-%m-%d %H:%M:%S")