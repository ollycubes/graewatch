from decimal import Decimal

def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect Fair Value Gaps (FVG) — three-candle gap patterns.
    Prices are assumed to be decimal.Decimal objects.
    """
    fvg_events = []

    for i in range(2, len(candles)):
        c1 = candles[i - 2]  # first candle
        c2 = candles[i - 1]  # middle candle (impulse)
        c3 = candles[i]      # third candle

        # Bullish FVG: gap between c1 high and c3 low
        if c1["high"] < c3["low"]:
            top = c3["low"]
            bottom = c1["high"]

            # Find when price enters the gap zone (mitigation)
            end_timestamp = None
            for j in range(i + 1, len(candles)):
                if candles[j]["low"] <= top:
                    end_timestamp = candles[j]["timestamp"]
                    break

            fvg_events.append({
                "timestamp": c2["timestamp"],
                "end_timestamp": end_timestamp,
                "direction": "bullish",
                "top": top,
                "bottom": bottom,
            })

        # Bearish FVG: gap between c3 high and c1 low
        if c1["low"] > c3["high"]:
            top = c1["low"]
            bottom = c3["high"]

            # Find when price enters the gap zone (mitigation)
            end_timestamp = None
            for j in range(i + 1, len(candles)):
                if candles[j]["high"] >= bottom:
                    end_timestamp = candles[j]["timestamp"]
                    break

            fvg_events.append({
                "timestamp": c2["timestamp"],
                "end_timestamp": end_timestamp,
                "direction": "bearish",
                "top": top,
                "bottom": bottom,
            })

    return fvg_events
