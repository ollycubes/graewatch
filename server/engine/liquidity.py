from __future__ import annotations
from decimal import Decimal


def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect liquidity sweeps — price wicks beyond a swing high/low then closes
    back inside, indicating a stop hunt / liquidity grab.
    Prices are assumed to be decimal.Decimal objects.
    """
    if not candles:
        return []

    N = 3  # lookback for swing detection (consistent with BOS / Gann / OB)

    swing_highs = []
    swing_lows = []

    # ── Step 1: Identify swing highs and swing lows ────────────────────────
    for i in range(N, len(candles) - N):
        candle = candles[i]

        is_swing_high = all(
            candle["high"] > candles[i - j]["high"]
            and candle["high"] > candles[i + j]["high"]
            for j in range(1, N + 1)
        )

        is_swing_low = all(
            candle["low"] < candles[i - j]["low"]
            and candle["low"] < candles[i + j]["low"]
            for j in range(1, N + 1)
        )

        if is_swing_high:
            swing_highs.append({
                "index": i,
                "timestamp": candle["timestamp"],
                "price": candle["high"],
            })

        if is_swing_low:
            swing_lows.append({
                "index": i,
                "timestamp": candle["timestamp"],
                "price": candle["low"],
            })

    # ── Step 2: Compute ATR for equal-level tolerance ──────────────────────
    atr = _compute_atr(candles, period=14)
    tolerance = atr * Decimal("0.1")

    # ── Step 3: Mark equal highs / equal lows (pools) ──────────────────────
    _mark_pools(swing_highs, tolerance)
    _mark_pools(swing_lows, tolerance)

    # ── Step 4: Scan for sweeps ────────────────────────────────────────────
    events = []

    # Track active (un-swept) swing levels
    active_highs = []
    active_lows = []
    high_idx = 0
    low_idx = 0

    for i in range(len(candles)):
        candle = candles[i]

        # Activate swings that are now confirmed (N bars after the swing)
        while high_idx < len(swing_highs) and swing_highs[high_idx]["index"] + N <= i:
            active_highs.append(swing_highs[high_idx])
            high_idx += 1

        while low_idx < len(swing_lows) and swing_lows[low_idx]["index"] + N <= i:
            active_lows.append(swing_lows[low_idx])
            low_idx += 1

        # Check for sweeps of active highs (wick above)
        swept_high_indices = []
        for ah_i, ah in enumerate(active_highs):
            if candle["high"] > ah["price"]:
                events.append({
                    "source_timestamp": ah["timestamp"],
                    "timestamp": candle["timestamp"],
                    "direction": "bearish",
                    "price": ah["price"],
                    "pool": ah.get("pool", False),
                    "swept": True,
                })
                swept_high_indices.append(ah_i)

        # Check for sweeps of active lows (wick below)
        swept_low_indices = []
        for al_i, al in enumerate(active_lows):
            if candle["low"] < al["price"]:
                events.append({
                    "source_timestamp": al["timestamp"],
                    "timestamp": candle["timestamp"],
                    "direction": "bullish",
                    "price": al["price"],
                    "pool": al.get("pool", False),
                    "swept": True,
                })
                swept_low_indices.append(al_i)

        # Remove swept levels (iterate in reverse to preserve indices)
        for idx in reversed(swept_high_indices):
            active_highs.pop(idx)
        for idx in reversed(swept_low_indices):
            active_lows.pop(idx)

    # ── Step 5: Emit remaining unswept levels ─────────────────────────────
    # Limit to the 6 most recent to avoid chart clutter.
    last_ts = candles[-1]["timestamp"]
    for ah in active_highs[-6:]:
        events.append({
            "source_timestamp": ah["timestamp"],
            "timestamp": last_ts,
            "direction": "bearish",
            "price": ah["price"],
            "pool": ah.get("pool", False),
            "swept": False,
        })
    for al in active_lows[-6:]:
        events.append({
            "source_timestamp": al["timestamp"],
            "timestamp": last_ts,
            "direction": "bullish",
            "price": al["price"],
            "pool": al.get("pool", False),
            "swept": False,
        })

    return events


def _compute_atr(candles: list[dict], period=14) -> Decimal:
    """Simple Average True Range calculation using Decimal."""
    if len(candles) < 2:
        return Decimal("0.0")

    true_ranges = []
    for i in range(1, len(candles)):
        high = Decimal(str(candles[i]["high"]))
        low = Decimal(str(candles[i]["low"]))
        prev_close = Decimal(str(candles[i - 1]["close"]))
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        true_ranges.append(tr)

    recent = true_ranges[-period:]
    return sum(recent) / Decimal(str(len(recent))) if recent else Decimal("0.0")


def _mark_pools(swings, tolerance):
    """
    Mark swings that are part of an equal highs/lows cluster (pool).
    Two or more swings within `tolerance` of each other form a pool.
    Mutates each swing dict in-place, setting pool=True where applicable.
    """
    if tolerance <= 0:
        return

    for i, a in enumerate(swings):
        for b in swings[i + 1:]:
            if abs(a["price"] - b["price"]) <= tolerance:
                a["pool"] = True
                b["pool"] = True
