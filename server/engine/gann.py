def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect Gann box zones by pairing consecutive swing highs and swing lows.
    Prices are assumed to be decimal.Decimal objects.
    """
    N = 3  # lookback for swing detection (same as BOS)
    swings = []

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
            swings.append(
                {
                    "index": i,
                    "timestamp": candle["timestamp"],
                    "price": candle["high"],
                    "type": "high",
                }
            )

        if is_swing_low:
            swings.append(
                {
                    "index": i,
                    "timestamp": candle["timestamp"],
                    "price": candle["low"],
                    "type": "low",
                }
            )

    swings.sort(key=lambda x: x["index"])

    # Pair consecutive opposite swings to form Gann boxes.
    gann_boxes = []
    i = 0
    while i < len(swings) - 1:
        a = swings[i]
        # Find the next swing of opposite type.
        j = i + 1
        while j < len(swings) and swings[j]["type"] == a["type"]:
            j += 1
        if j >= len(swings):
            break

        b = swings[j]

        if a["type"] == "low":
            direction = "bullish"
            high_price = b["price"]
            low_price = a["price"]
        else:
            direction = "bearish"
            high_price = a["price"]
            low_price = b["price"]

        gann_boxes.append(
            {
                "start_timestamp": a["timestamp"],
                "end_timestamp": b["timestamp"],
                "high_price": high_price,
                "low_price": low_price,
                "direction": direction,
            }
        )

        i = j

    return gann_boxes
