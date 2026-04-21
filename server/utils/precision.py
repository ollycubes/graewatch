from decimal import Decimal
from typing import Any

def to_decimal(val: Any) -> Decimal:
    """Convert a value to Decimal, handling None and existing types."""
    if val is None:
        return Decimal(0)
    return Decimal(str(val))

def convert_candles_to_decimal(candles: list[dict]) -> list[dict]:
    """Convert candle prices to Decimal for internal engine math."""
    decimal_candles = []
    for c in candles:
        decimal_candles.append({
            **c,
            "open": to_decimal(c["open"]),
            "high": to_decimal(c["high"]),
            "low": to_decimal(c["low"]),
            "close": to_decimal(c["close"]),
        })
    return decimal_candles

def convert_to_float(data: Any) -> Any:
    """
    Recursively convert Decimal objects back to float for JSON serialization.
    """
    if isinstance(data, list):
        return [convert_to_float(item) for item in data]
    if isinstance(data, dict):
        return {k: convert_to_float(v) for k, v in data.items()}
    if isinstance(data, Decimal):
        return float(data)
    return data
