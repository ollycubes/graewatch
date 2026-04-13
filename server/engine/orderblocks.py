from __future__ import annotations


def detect(candles: list[dict]) -> list[dict]:
    """
    Detect Order Blocks (OB) — the last opposing candle before a Break of Structure.

    A bullish OB is the last bearish candle before a bullish BOS (close above swing high).
    A bearish OB is the last bullish candle before a bearish BOS (close below swing low).

    Zone ranges:
        - Bullish OB (bearish candle): open → high (top wick)
        - Bearish OB (bullish candle): low (bottom wick) → open
    Mitigation occurs when a later candle's wick enters the OB zone.

    Returns a list of dicts with:
        - timestamp:      OB candle timestamp (zone start)
        - end_timestamp:  when mitigated (zone end), or None if unmitigated
        - direction:      "bullish" or "bearish"
        - top:            upper boundary of the OB zone
        - bottom:         lower boundary of the OB zone
    """
    N = 3  # lookback for swing detection (consistent with BOS / Gann)
    swing_highs: list[dict] = []
    swing_lows: list[dict] = []

    # ── Step 1: Identify swing highs and swing lows ──────────────────────
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
            swing_highs.append({"index": i, "price": candle["high"]})

        if is_swing_low:
            swing_lows.append({"index": i, "price": candle["low"]})

    # Build combined timeline of swings for reference
    swings: list[dict] = []
    for sh in swing_highs:
        swings.append({**sh, "type": "high"})
    for sl in swing_lows:
        swings.append({**sl, "type": "low"})
    swings.sort(key=lambda x: x["index"])

    # ── Step 2: Scan for BOS events and capture the Order Block candle ───
    last_swing_high: dict | None = None
    last_swing_low: dict | None = None
    swing_idx = 0
    ob_events: list[dict] = []
    seen_obs: set[int] = set()  # prevent duplicate OBs from the same candle

    for i in range(len(candles)):
        # Advance the swing pointer: only consider swings confirmed N bars ago
        while swing_idx < len(swings) and swings[swing_idx]["index"] <= i - N:
            if swings[swing_idx]["type"] == "high":
                last_swing_high = swings[swing_idx]
            else:
                last_swing_low = swings[swing_idx]
            swing_idx += 1

        candle = candles[i]

        # Bullish BOS: close breaks above the last swing high
        # → Order Block = last bearish candle before this break
        if last_swing_high and candle["close"] > last_swing_high["price"]:
            ob_candle = _find_last_opposing_candle(
                candles, i, direction="bearish",
                search_start=last_swing_high["index"],
            )
            if ob_candle is not None and ob_candle["index"] not in seen_obs:
                seen_obs.add(ob_candle["index"])
                ob_events.append({
                    "ob_index": ob_candle["index"],
                    "bos_index": i,
                    "direction": "bullish",
                    "top": ob_candle["high"],
                    "bottom": ob_candle["open"],
                    "timestamp": ob_candle["timestamp"],
                })
            last_swing_high = None  # reset to prevent duplicate BOS signals

        # Bearish BOS: close breaks below the last swing low
        # → Order Block = last bullish candle before this break
        if last_swing_low and candle["close"] < last_swing_low["price"]:
            ob_candle = _find_last_opposing_candle(
                candles, i, direction="bullish",
                search_start=last_swing_low["index"],
            )
            if ob_candle is not None and ob_candle["index"] not in seen_obs:
                seen_obs.add(ob_candle["index"])
                ob_events.append({
                    "ob_index": ob_candle["index"],
                    "bos_index": i,
                    "direction": "bearish",
                    "top": ob_candle["open"],
                    "bottom": ob_candle["low"],
                    "timestamp": ob_candle["timestamp"],
                })
            last_swing_low = None

    # ── Step 3: Check mitigation for each OB ─────────────────────────────
    results: list[dict] = []
    for ob in ob_events:
        end_timestamp = _find_mitigation(candles, ob)
        results.append({
            "timestamp": ob["timestamp"],
            "end_timestamp": end_timestamp,
            "direction": ob["direction"],
            "top": ob["top"],
            "bottom": ob["bottom"],
        })

    return results


def _find_last_opposing_candle(
    candles: list[dict],
    bos_index: int,
    direction: str,
    search_start: int,
) -> dict | None:
    """
    Walk backwards from the BOS candle to find the last candle of the
    opposing type (bearish candle for a bullish OB, bullish for bearish OB).

    A bearish candle: close < open
    A bullish candle: close > open
    """
    for j in range(bos_index - 1, max(search_start - 1, -1), -1):
        c = candles[j]
        if direction == "bearish" and c["close"] < c["open"]:
            return {"index": j, "open": c["open"], "high": c["high"], "low": c["low"], "timestamp": c["timestamp"]}
        if direction == "bullish" and c["close"] > c["open"]:
            return {"index": j, "open": c["open"], "high": c["high"], "low": c["low"], "timestamp": c["timestamp"]}
    return None


def _find_mitigation(candles: list[dict], ob: dict) -> str | None:
    """
    Scan forward from the BOS candle to find the first candle whose wick
    enters the OB zone, indicating the block has been mitigated.

    Bullish OB mitigated when a candle's low dips into the zone (low <= top).
    Bearish OB mitigated when a candle's high reaches into the zone (high >= bottom).
    """
    for k in range(ob["bos_index"] + 1, len(candles)):
        c = candles[k]
        if ob["direction"] == "bullish" and c["low"] <= ob["top"]:
            return c["timestamp"]
        if ob["direction"] == "bearish" and c["high"] >= ob["bottom"]:
            return c["timestamp"]
    return None
