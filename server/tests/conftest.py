"""
Shared test helpers and fixtures for engine unit tests.
Uses Decimal for high-precision price math.
"""
from decimal import Decimal


def make_candle(timestamp: int, open_: float, high: float, low: float, close: float) -> dict:
    """Build a minimal candle dict with Decimal prices."""
    return {
        "timestamp": timestamp,
        "open": Decimal(str(open_)),
        "high": Decimal(str(high)),
        "low": Decimal(str(low)),
        "close": Decimal(str(close)),
    }


def flat_candles(n: int, price: float = 1.0, start_ts: int = 0) -> list[dict]:
    """
    Return `n` candles all at the same price (open=high=low=close=price).
    Timestamps increment by 1 from `start_ts`.
    """
    return [make_candle(start_ts + i, price, price, price, price) for i in range(n)]


def candles_with_spike_high(
    spike_index: int,
    spike_price: float,
    n: int = 20,
    base_price: float = 1.0,
    start_ts: int = 0,
) -> list[dict]:
    """
    `n` flat candles at `base_price` with a spike high at `spike_index`.
    All other candles are normal flat candles.
    """
    candles = flat_candles(n, base_price, start_ts)
    ts = start_ts + spike_index
    candles[spike_index] = make_candle(ts, base_price, spike_price, base_price, base_price)
    return candles


def candles_with_spike_low(
    spike_index: int,
    spike_price: float,
    n: int = 20,
    base_price: float = 1.0,
    start_ts: int = 0,
) -> list[dict]:
    """
    `n` flat candles at `base_price` with a spike low at `spike_index`.
    """
    candles = flat_candles(n, base_price, start_ts)
    ts = start_ts + spike_index
    candles[spike_index] = make_candle(ts, base_price, base_price, spike_price, base_price)
    return candles
