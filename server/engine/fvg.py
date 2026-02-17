def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect Fair Value Gaps (FVG) — three-candle gap patterns.

    Bullish FVG: candle[i-2].high < candle[i].low (gap up)
    Bearish FVG: candle[i-2].low > candle[i].high (gap down)

    Returns the gap zone coordinates for each FVG.
    """
    fvg_events = []

    for i in range(2, len(candles)):
        c1 = candles[i - 2]  # first candle
        c2 = candles[i - 1]  # middle candle (impulse)
        c3 = candles[i]      # third candle

        # Bullish FVG: gap between c1 high and c3 low
        if c1["high"] < c3["low"]:
            fvg_events.append({
                "timestamp": c2["timestamp"],
                "direction": "bullish",
                "top": c3["low"],
                "bottom": c1["high"],
            })

        # Bearish FVG: gap between c3 high and c1 low
        if c1["low"] > c3["high"]:
            fvg_events.append({
                "timestamp": c2["timestamp"],
                "direction": "bearish",
                "top": c1["low"],
                "bottom": c3["high"],
            })

    return fvg_events
