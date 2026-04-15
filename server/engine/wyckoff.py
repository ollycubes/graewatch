from __future__ import annotations

# ── Tuning constants ──────────────────────────────────────────────────────────

# Minimum candles inside the consolidation window to qualify as a range
MIN_RANGE_CANDLES = 12

# Range height must be ≤ this multiple of ATR(14) to count as consolidation
RANGE_ATR_MULT = 2.5

# Allow slight expansion when extending a confirmed range
EXTEND_ATR_MULT = 3.5

# Candles after the range ends to scan for a spring / upthrust
LOOKAHEAD = 25

# Candles before range start used to determine Wyckoff phase
TREND_LOOKBACK = 15


def detect(candles: list[dict]) -> list[dict]:  # pyright: ignore
    """
    Detect Wyckoff Springs and Upthrusts from consolidation ranges.

    A trading range is a sequence of candles where price oscillates within
    ≤ RANGE_ATR_MULT × ATR(14).  At the range's conclusion:

        Spring   — wick below range support, close back inside → bullish
        Upthrust — wick above range resistance, close back inside → bearish

    The Wyckoff *phase* is determined by the trend that preceded the range:
        accumulation  — price was falling into the range (smart money buying)
        distribution  — price was rising into the range (smart money selling)
        unknown       — insufficient pre-range context

    Each returned signal contains:
        timestamp         str    — candle that formed the spring / upthrust
        type              str    — "spring" | "upthrust"
        direction         str    — "bullish" | "bearish" (expected move)
        level             float  — the support or resistance level swept
        range_start       str    — timestamp when the trading range began
        range_end         str    — timestamp of the last candle inside the range
        range_support     float  — lower boundary of the range
        range_resistance  float  — upper boundary of the range
        phase             str    — "accumulation" | "distribution" | "unknown"
    """
    if len(candles) < MIN_RANGE_CANDLES + LOOKAHEAD:
        return []

    atr = _compute_atr(candles, period=14)
    if atr == 0:
        return []

    ranges = _detect_ranges(candles, atr)
    return _detect_events(candles, ranges)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _detect_ranges(candles: list[dict], atr: float) -> list[dict]:
    """
    Greedy left-to-right scan for consolidation ranges.
    When a valid range is found the scan jumps past it, preventing overlap.
    """
    max_initial = RANGE_ATR_MULT * atr
    max_extended = EXTEND_ATR_MULT * atr

    ranges: list[dict] = []
    i = 0

    while i < len(candles) - MIN_RANGE_CANDLES:
        window = candles[i: i + MIN_RANGE_CANDLES]
        highs = [c["high"] for c in window]
        lows = [c["low"] for c in window]

        if max(highs) - min(lows) > max_initial:
            i += 1
            continue

        # Valid seed — extend as far as possible while height stays bounded
        resistance = max(highs)
        support = min(lows)
        end_idx = i + MIN_RANGE_CANDLES

        while end_idx < len(candles):
            c = candles[end_idx]
            new_r = max(resistance, c["high"])
            new_s = min(support, c["low"])
            if new_r - new_s > max_extended:
                break
            resistance = new_r
            support = new_s
            end_idx += 1

        if end_idx - i < MIN_RANGE_CANDLES:
            i += 1
            continue

        # Phase: what was price doing before it entered this range?
        phase = "unknown"
        if i >= TREND_LOOKBACK:
            pre_close = candles[i - TREND_LOOKBACK]["close"]
            entry_close = candles[i]["close"]
            delta = entry_close - pre_close
            if delta < -atr * 0.5:
                phase = "accumulation"   # price falling into range
            elif delta > atr * 0.5:
                phase = "distribution"   # price rising into range

        ranges.append({
            "start_index": i,
            "end_index": end_idx,
            "start_timestamp": candles[i]["timestamp"],
            "end_timestamp": candles[end_idx - 1]["timestamp"],
            "support": round(support, 5),
            "resistance": round(resistance, 5),
            "phase": phase,
        })

        i = end_idx  # skip past this range

    return ranges


def _detect_events(candles: list[dict], ranges: list[dict]) -> list[dict]:
    """
    Look ahead after each range for a Spring or Upthrust.
    Records at most one event per range (whichever appears first).
    """
    signals: list[dict] = []

    for r in ranges:
        look_start = r["end_index"]
        look_end = min(look_start + LOOKAHEAD, len(candles))

        for j in range(look_start, look_end):
            c = candles[j]

            # Spring: wick below support, close back inside → bullish entry
            if c["low"] < r["support"] and c["close"] > r["support"]:
                signals.append({
                    "timestamp": c["timestamp"],
                    "type": "spring",
                    "direction": "bullish",
                    "level": r["support"],
                    "range_start": r["start_timestamp"],
                    "range_end": r["end_timestamp"],
                    "range_support": r["support"],
                    "range_resistance": r["resistance"],
                    "phase": r["phase"],
                })
                break

            # Upthrust: wick above resistance, close back inside → bearish entry
            if c["high"] > r["resistance"] and c["close"] < r["resistance"]:
                signals.append({
                    "timestamp": c["timestamp"],
                    "type": "upthrust",
                    "direction": "bearish",
                    "level": r["resistance"],
                    "range_start": r["start_timestamp"],
                    "range_end": r["end_timestamp"],
                    "range_support": r["support"],
                    "range_resistance": r["resistance"],
                    "phase": r["phase"],
                })
                break

    return signals


def _compute_atr(candles: list[dict], period: int = 14) -> float:
    """14-period Average True Range."""
    if len(candles) < 2:
        return 0.0
    true_ranges = []
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        true_ranges.append(max(h - l, abs(h - pc), abs(l - pc)))
    recent = true_ranges[-period:]
    return sum(recent) / len(recent) if recent else 0.0
