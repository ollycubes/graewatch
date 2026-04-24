def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect Break of Structure (BOS) events.
    Prices are assumed to be decimal.Decimal objects.
    """
    N = 3  # lookback for swing detection
    swing_highs = []
    swing_lows = []
    bos_events = []

    # Identify all swing highs and swing lows
    for i in range(N, len(candles) - N):
        candle = candles[i]

        # Check swing high: this candle's high > all N candles either side
        is_swing_high = all(
            candle["high"] > candles[i - j]["high"] and
            candle["high"] > candles[i + j]["high"]
            for j in range(1, N + 1)
        )

        # Check swing low: this candle's low < all N candles either side
        is_swing_low = all(
            candle["low"] < candles[i - j]["low"] and
            candle["low"] < candles[i + j]["low"]
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

    # Build a combined timeline of swings
    swings = []
    for sh in swing_highs:
        swings.append({**sh, "type": "high"})
    for sl in swing_lows:
        swings.append({**sl, "type": "low"})
    swings.sort(key=lambda x: x["index"])

    # Scan candles and check for breaks
    last_swing_high = None
    last_swing_low = None
    swing_idx = 0

    for i in range(len(candles)):
        # Update latest swings that have been confirmed (index <= current candle)
        while swing_idx < len(swings) and swings[swing_idx]["index"] <= i - N:
            if swings[swing_idx]["type"] == "high":
                last_swing_high = swings[swing_idx]
            else:
                last_swing_low = swings[swing_idx]
            swing_idx += 1

        candle = candles[i]

        # Bullish BOS: close above last swing high
        if last_swing_high and candle["close"] > last_swing_high["price"]:
            bos_events.append({
                "swing_timestamp": last_swing_high["timestamp"],
                "timestamp": candle["timestamp"],
                "direction": "bullish",
                "price": candle["close"],
                "swing_ref": last_swing_high["price"],
            })
            # Reset to avoid duplicate signals at the same level
            last_swing_high = None

        # Bearish BOS: close below last swing low
        if last_swing_low and candle["close"] < last_swing_low["price"]:
            bos_events.append({
                "swing_timestamp": last_swing_low["timestamp"],
                "timestamp": candle["timestamp"],
                "direction": "bearish",
                "price": candle["close"],
                "swing_ref": last_swing_low["price"],
            })
            last_swing_low = None

    return bos_events