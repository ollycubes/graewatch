from datetime import datetime, timedelta

CANDLE_COUNTS = {
    "15min": 4,
    "1h": 4,
    "4h": 6,
    "daily": 5,
    "weekly": 4,
}

INTERVAL_DELTAS = {
    "15min": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
}

TIMESTAMP_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
]


def _parse_timestamp(ts):
    if isinstance(ts, datetime):
        return ts
    for fmt in TIMESTAMP_FORMATS:
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            continue
    return None


def _format_timestamp(dt, interval):
    if interval in ("daily", "weekly"):
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _compute_atr(candles, period=14):
    recent = candles[-period:] if len(candles) >= period else candles
    total = 0.0
    for i, c in enumerate(recent):
        high_low = c["high"] - c["low"]
        if i == 0:
            total += high_low
        else:
            prev_close = recent[i - 1]["close"]
            tr = max(high_low, abs(c["high"] - prev_close), abs(c["low"] - prev_close))
            total += tr
    return total / len(recent) if recent else 0.0


def simulate_candles(candles, bos_signals, fvg_signals, interval):
    if not candles or interval not in CANDLE_COUNTS:
        return {"simulated": [], "bias": "neutral", "target_zone": None}

    count = CANDLE_COUNTS[interval]
    delta = INTERVAL_DELTAS[interval]
    atr = _compute_atr(candles)

    if atr == 0:
        return {"simulated": [], "bias": "neutral", "target_zone": None}

    # Determine bias from most recent BOS
    bias = None
    if bos_signals:
        last_bos = bos_signals[-1]
        bias = last_bos.get("direction")

    if not bias:
        return {"simulated": [], "bias": "neutral", "target_zone": None}

    # Find open (unmitigated) FVG zones matching the bias
    open_fvgs = [
        f for f in fvg_signals
        if f.get("end_timestamp") is None and f.get("direction") == bias
    ]

    target_zone = None
    target_price = None
    last_close = candles[-1]["close"]

    if open_fvgs:
        # Pick the nearest open FVG
        nearest = min(open_fvgs, key=lambda f: abs((f["top"] + f["bottom"]) / 2 - last_close))
        target_zone = {"top": nearest["top"], "bottom": nearest["bottom"]}
        if bias == "bullish":
            target_price = nearest["top"]
        else:
            target_price = nearest["bottom"]
    else:
        # No open FVG — project based on ATR
        if bias == "bullish":
            target_price = last_close + atr * count * 0.4
        else:
            target_price = last_close - atr * count * 0.4

    # Generate candles trending toward target
    last_candle = candles[-1]
    last_ts = _parse_timestamp(last_candle["timestamp"])
    if last_ts is None:
        return {"simulated": [], "bias": bias, "target_zone": target_zone}

    current_price = last_close
    step = (target_price - current_price) / count if count > 0 else 0
    body_ratio = 0.5
    simulated = []

    for i in range(count):
        ts = last_ts + delta * (i + 1)
        progress = (i + 1) / count

        move = step + atr * 0.05 * (1 - progress)
        if bias == "bearish":
            move = step - atr * 0.05 * (1 - progress)

        new_close = current_price + move
        body_size = abs(move) if abs(move) > atr * 0.1 else atr * 0.25

        if bias == "bullish":
            o = new_close - body_size * body_ratio
            c = new_close
            h = c + atr * 0.15
            l = o - atr * 0.1
        else:
            o = new_close + body_size * body_ratio
            c = new_close
            h = o + atr * 0.1
            l = c - atr * 0.15

        simulated.append({
            "timestamp": _format_timestamp(ts, interval),
            "open": round(o, 5),
            "high": round(h, 5),
            "low": round(l, 5),
            "close": round(c, 5),
            "simulated": True,
        })

        current_price = c

    return {
        "simulated": simulated,
        "bias": bias,
        "target_zone": target_zone,
    }
