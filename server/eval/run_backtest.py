"""
Walk-forward backtest used by dissertation section 7.2.2.

Run from the `server/` directory:

    python eval/run_backtest.py                       # daily, 3 majors, 2023-2024
    python eval/run_backtest.py --interval 4h         # 4-hour bars (slower)
    python eval/run_backtest.py --pairs EUR/USD       # single pair

Outputs a JSON summary and per-trade CSVs under `server/eval/results/`.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from dataclasses import dataclass, asdict
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

# Make `engine.*` and `utils.*` importable when this script is run from
# either `server/` or as `python -m eval.run_backtest`.
SERVER_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_ROOT))
load_dotenv(SERVER_ROOT.parent / ".env")

from engine.bos import detect as bos_detect  # noqa: E402
from engine.fvg import detect as fvg_detect  # noqa: E402
from engine.orderblocks import detect as ob_detect  # noqa: E402
from engine.liquidity import detect as liq_detect  # noqa: E402
from engine.wyckoff import detect as wyckoff_detect  # noqa: E402
from engine.gann import detect as gann_detect  # noqa: E402
from engine.setup import detect as setup_detect  # noqa: E402
from routes.intervals import (  # noqa: E402
    HTF_MAP,
    TWELVE_DATA_INTERVAL_MAP,
    normalize_timestamp,
)
from utils.precision import (  # noqa: E402
    convert_candles_to_decimal,
    convert_to_float,
)

TD_BASE_URL = "https://api.twelvedata.com/time_series"

# ── Evaluation parameters ────────────────────────────────────────────────────
BOS_LOOKAHEAD = 10           # bars to wait for follow-through after a BOS
BOS_CONTINUATION_ATR = Decimal("1.0")   # extension past swing that = success
BOS_INVALIDATION_ATR = Decimal("0.5")   # close back through swing that = fail

SETUP_LOOKAHEAD = 60         # bars allowed for a setup to play out
POI_TOUCH_TOLERANCE_ATR = Decimal("0.25")  # how close price must come to entry zone

MIN_HISTORY = 50             # bars before walk-forward starts firing detectors


# ── Data classes ─────────────────────────────────────────────────────────────


@dataclass
class BosTrial:
    pair: str
    interval: str
    bos_timestamp: str
    direction: str
    swing_ref: float
    outcome: str            # continuation | invalidation | inconclusive


@dataclass
class SetupTrade:
    pair: str
    interval: str
    detected_at: str
    bias: str
    entry_top: float
    entry_bottom: float
    target: float
    stop: float
    planned_rr: float
    outcome: str            # win | loss | open | no_touch
    realised_r: float       # in R-multiples (loss = -1, win = +planned_rr)
    bars_to_outcome: int


@dataclass
class BaselineTrade:
    pair: str
    interval: str
    detected_at: str
    direction: str
    entry: float
    target: float
    stop: float
    planned_rr: float
    outcome: str
    realised_r: float
    bars_to_outcome: int


# ── TwelveData fetch ─────────────────────────────────────────────────────────


async def fetch_td(
    pair: str, interval: str, start: str, end: str, api_key: str
) -> list[dict]:
    td_interval = TWELVE_DATA_INTERVAL_MAP[interval]
    params = {
        "symbol": pair,
        "interval": td_interval,
        "start_date": start,
        "end_date": end,
        "outputsize": 5000,
        "order": "asc",
        "apikey": api_key,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(TD_BASE_URL, params=params)
        data = response.json()

    if "values" not in data:
        raise RuntimeError(f"TwelveData error for {pair} {interval}: {data}")

    candles: list[dict] = []
    for item in data["values"]:
        candles.append({
            "timestamp": normalize_timestamp(item["datetime"], interval),
            "open": item["open"],
            "high": item["high"],
            "low": item["low"],
            "close": item["close"],
        })
    candles.sort(key=lambda c: c["timestamp"])
    return candles


# ── Helpers ──────────────────────────────────────────────────────────────────


def trailing_atr(candles: list[dict], period: int = 14) -> Decimal:
    """ATR over the most recent `period` bars (Decimal in, Decimal out)."""
    if len(candles) < 2:
        return Decimal("0.0001")
    trs = []
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    recent = trs[-period:]
    return sum(recent) / Decimal(str(len(recent))) if recent else Decimal("0.0001")


def htf_window(htf: list[dict], cutoff_ts: str) -> list[dict]:
    """Return only HTF candles closed on or before the cutoff timestamp."""
    return [c for c in htf if c["timestamp"] <= cutoff_ts]


# ── BOS continuation evaluation ──────────────────────────────────────────────


def evaluate_bos_continuation(candles: list[dict], pair: str, interval: str) -> list[BosTrial]:
    """
    For every BOS event, check whether the next BOS_LOOKAHEAD bars
    extend ≥ 1 ATR past the broken swing (continuation) or close back
    through swing − 0.5 ATR (invalidation).
    """
    trials: list[BosTrial] = []
    bos_events = bos_detect(candles)
    ts_to_index = {c["timestamp"]: i for i, c in enumerate(candles)}

    for ev in bos_events:
        idx = ts_to_index.get(ev["timestamp"])
        if idx is None or idx + 1 >= len(candles):
            continue
        atr = trailing_atr(candles[: idx + 1])
        swing = ev["swing_ref"]
        outcome = "inconclusive"

        for k in range(1, BOS_LOOKAHEAD + 1):
            j = idx + k
            if j >= len(candles):
                break
            c = candles[j]
            if ev["direction"] == "bullish":
                if c["high"] >= swing + atr * BOS_CONTINUATION_ATR:
                    outcome = "continuation"
                    break
                if c["close"] <= swing - atr * BOS_INVALIDATION_ATR:
                    outcome = "invalidation"
                    break
            else:
                if c["low"] <= swing - atr * BOS_CONTINUATION_ATR:
                    outcome = "continuation"
                    break
                if c["close"] >= swing + atr * BOS_INVALIDATION_ATR:
                    outcome = "invalidation"
                    break

        trials.append(
            BosTrial(
                pair=pair,
                interval=interval,
                bos_timestamp=ev["timestamp"],
                direction=ev["direction"],
                swing_ref=float(swing),
                outcome=outcome,
            )
        )
    return trials


# ── Setup walk-forward simulation ────────────────────────────────────────────


def simulate_setup_outcome(
    setup: dict, future: list[dict]
) -> tuple[str, Decimal, int]:
    """
    Walk forward through `future` candles. Phase 1: wait for price to touch
    the entry zone. Phase 2: see whether target or stop hits first.
    Returns (outcome, realised_R, bars_to_outcome).
    """
    bias = setup["bias"]
    top = setup["entry_top"]
    bottom = setup["entry_bottom"]
    target = setup["target"]
    stop = setup["stop"]
    planned_rr = setup["risk_reward"]

    entry_mid = (top + bottom) / Decimal("2")
    risk = (entry_mid - stop) if bias == "bullish" else (stop - entry_mid)
    if risk <= 0:
        return ("invalid", Decimal("0"), 0)

    touched = setup.get("at_poi", False)
    touch_idx = -1
    atr_at_detection = (top - bottom) if (top - bottom) > 0 else Decimal("0.0001")
    tol = atr_at_detection * POI_TOUCH_TOLERANCE_ATR

    for k, c in enumerate(future[:SETUP_LOOKAHEAD], start=1):
        if not touched:
            if c["low"] - tol <= top and c["high"] + tol >= bottom:
                touched = True
                touch_idx = k
                continue
        if touched:
            hit_target = (
                c["high"] >= target if bias == "bullish" else c["low"] <= target
            )
            hit_stop = (
                c["low"] <= stop if bias == "bullish" else c["high"] >= stop
            )
            if hit_target and hit_stop:
                return ("loss", Decimal("-1"), k - max(touch_idx, 0))
            if hit_target:
                return ("win", planned_rr, k - max(touch_idx, 0))
            if hit_stop:
                return ("loss", Decimal("-1"), k - max(touch_idx, 0))

    if not touched:
        return ("no_touch", Decimal("0"), len(future[:SETUP_LOOKAHEAD]))
    return ("open", Decimal("0"), len(future[:SETUP_LOOKAHEAD]))


def walk_forward_setups(
    candles: list[dict],
    htf_candles: list[dict],
    htf_interval: str | None,
    pair: str,
    interval: str,
) -> list[SetupTrade]:
    trades: list[SetupTrade] = []
    seen_keys: set[tuple] = set()

    for t in range(MIN_HISTORY, len(candles) - 1):
        visible = candles[: t + 1]
        cutoff_ts = visible[-1]["timestamp"]

        bos = bos_detect(visible)
        fvg = fvg_detect(visible)
        ob = ob_detect(visible)
        liq = liq_detect(visible)
        wyck = wyckoff_detect(visible)

        htf_visible = htf_window(htf_candles, cutoff_ts)
        htf_bos = bos_detect(htf_visible) if htf_visible else []
        htf_gann = gann_detect(htf_visible) if htf_visible else []

        setup = setup_detect(
            candles=visible,
            bos_signals=bos,
            fvg_signals=fvg,
            ob_signals=ob,
            liq_signals=liq,
            htf_bos_signals=htf_bos,
            htf_gann_signals=htf_gann,
            htf_candles=htf_visible,
            wyckoff_signals=wyck,
            htf_interval=htf_interval,
        )

        if not setup.get("valid"):
            continue

        key = (
            setup["bias"],
            round(float(setup["entry_top"]), 5),
            round(float(setup["entry_bottom"]), 5),
            round(float(setup["target"]), 5),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)

        outcome, realised_r, bars = simulate_setup_outcome(
            setup, candles[t + 1 :]
        )

        trades.append(
            SetupTrade(
                pair=pair,
                interval=interval,
                detected_at=cutoff_ts,
                bias=setup["bias"],
                entry_top=float(setup["entry_top"]),
                entry_bottom=float(setup["entry_bottom"]),
                target=float(setup["target"]),
                stop=float(setup["stop"]),
                planned_rr=float(setup["risk_reward"]),
                outcome=outcome,
                realised_r=float(realised_r),
                bars_to_outcome=bars,
            )
        )
    return trades


# ── Naive SMA crossover baseline ─────────────────────────────────────────────


def baseline_sma_crossover(
    candles: list[dict], pair: str, interval: str
) -> list[BaselineTrade]:
    """20/50 SMA crossover with symmetric ATR target/stop (planned R:R = 1)."""
    closes = [c["close"] for c in candles]
    if len(closes) < 60:
        return []

    def sma(values: list[Decimal], period: int, end: int) -> Decimal | None:
        if end < period:
            return None
        window = values[end - period : end]
        return sum(window) / Decimal(str(period))

    trades: list[BaselineTrade] = []
    prev_diff = None

    for t in range(50, len(candles) - 1):
        fast = sma(closes, 20, t + 1)
        slow = sma(closes, 50, t + 1)
        if fast is None or slow is None:
            continue
        diff = fast - slow

        if prev_diff is None:
            prev_diff = diff
            continue

        crossed_up = prev_diff <= 0 < diff
        crossed_down = prev_diff >= 0 > diff
        prev_diff = diff

        if not (crossed_up or crossed_down):
            continue

        atr = trailing_atr(candles[: t + 1])
        entry = candles[t]["close"]
        if crossed_up:
            direction = "bullish"
            target = entry + atr * Decimal("2")
            stop = entry - atr * Decimal("2")
        else:
            direction = "bearish"
            target = entry - atr * Decimal("2")
            stop = entry + atr * Decimal("2")

        outcome = "open"
        realised_r = Decimal("0")
        bars = 0
        for k, c in enumerate(candles[t + 1 : t + 1 + SETUP_LOOKAHEAD], start=1):
            hit_target = (
                c["high"] >= target if direction == "bullish" else c["low"] <= target
            )
            hit_stop = (
                c["low"] <= stop if direction == "bullish" else c["high"] >= stop
            )
            if hit_target and hit_stop:
                outcome, realised_r, bars = "loss", Decimal("-1"), k
                break
            if hit_target:
                outcome, realised_r, bars = "win", Decimal("1"), k
                break
            if hit_stop:
                outcome, realised_r, bars = "loss", Decimal("-1"), k
                break
        else:
            bars = min(SETUP_LOOKAHEAD, len(candles) - t - 1)

        trades.append(
            BaselineTrade(
                pair=pair,
                interval=interval,
                detected_at=candles[t]["timestamp"],
                direction=direction,
                entry=float(entry),
                target=float(target),
                stop=float(stop),
                planned_rr=1.0,
                outcome=outcome,
                realised_r=float(realised_r),
                bars_to_outcome=bars,
            )
        )

    return trades


# ── Summarisation ────────────────────────────────────────────────────────────


def summarise_setups(trades: list) -> dict[str, Any]:
    closed = [t for t in trades if t.outcome in ("win", "loss")]
    wins = [t for t in closed if t.outcome == "win"]
    return {
        "total": len(trades),
        "closed": len(closed),
        "open_or_no_touch": len(trades) - len(closed),
        "wins": len(wins),
        "losses": len(closed) - len(wins),
        "win_rate": (len(wins) / len(closed)) if closed else 0.0,
        "avg_planned_rr": (
            sum(t.planned_rr for t in trades) / len(trades) if trades else 0.0
        ),
        "avg_realised_r": (
            sum(t.realised_r for t in closed) / len(closed) if closed else 0.0
        ),
        "total_r": sum(t.realised_r for t in closed),
    }


def summarise_bos(trials: list[BosTrial]) -> dict[str, Any]:
    total = len(trials)
    cont = sum(1 for t in trials if t.outcome == "continuation")
    inv = sum(1 for t in trials if t.outcome == "invalidation")
    inc = sum(1 for t in trials if t.outcome == "inconclusive")
    decided = cont + inv
    return {
        "total": total,
        "continuation": cont,
        "invalidation": inv,
        "inconclusive": inc,
        "continuation_rate_decided": (cont / decided) if decided else 0.0,
        "continuation_rate_all": (cont / total) if total else 0.0,
    }


def write_csv(path: Path, rows: list) -> None:
    if not rows:
        path.write_text("")
        return
    fieldnames = list(asdict(rows[0]).keys())
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))


# ── Orchestration ────────────────────────────────────────────────────────────


async def run(
    pairs: list[str], interval: str, start: str, end: str, out_dir: Path, api_key: str
) -> dict[str, Any]:
    htf_interval = HTF_MAP.get(interval)
    summary: dict[str, Any] = {
        "interval": interval,
        "htf_interval": htf_interval,
        "start": start,
        "end": end,
        "pairs": {},
    }

    all_bos: list[BosTrial] = []
    all_setups: list[SetupTrade] = []
    all_baseline: list[BaselineTrade] = []

    for pair in pairs:
        print(f"\n[{pair}] Fetching {interval} candles {start} → {end}…")
        raw = await fetch_td(pair, interval, start, end, api_key)
        print(f"[{pair}] Got {len(raw)} {interval} candles")

        htf_raw: list[dict] = []
        if htf_interval:
            print(f"[{pair}] Fetching {htf_interval} HTF candles…")
            htf_raw = await fetch_td(pair, htf_interval, start, end, api_key)
            print(f"[{pair}] Got {len(htf_raw)} {htf_interval} candles")

        candles = convert_candles_to_decimal(raw)
        htf = convert_candles_to_decimal(htf_raw)

        print(f"[{pair}] Evaluating BOS continuation…")
        bos_trials = evaluate_bos_continuation(candles, pair, interval)

        print(f"[{pair}] Walk-forward setup simulation ({len(candles)} bars)…")
        setup_trades = walk_forward_setups(candles, htf, htf_interval, pair, interval)

        print(f"[{pair}] Baseline SMA crossover…")
        baseline_trades = baseline_sma_crossover(candles, pair, interval)

        summary["pairs"][pair] = {
            "candles": len(candles),
            "bos": summarise_bos(bos_trials),
            "setups": summarise_setups(setup_trades),
            "baseline": summarise_setups(baseline_trades),
        }

        all_bos.extend(bos_trials)
        all_setups.extend(setup_trades)
        all_baseline.extend(baseline_trades)

    summary["aggregate"] = {
        "bos": summarise_bos(all_bos),
        "setups": summarise_setups(all_setups),
        "baseline": summarise_setups(all_baseline),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = interval
    write_csv(out_dir / f"bos_{suffix}.csv", all_bos)
    write_csv(out_dir / f"setups_{suffix}.csv", all_setups)
    write_csv(out_dir / f"baseline_{suffix}.csv", all_baseline)
    (out_dir / f"summary_{suffix}.json").write_text(
        json.dumps(convert_to_float(summary), indent=2)
    )
    return summary


def print_table(summary: dict[str, Any]) -> None:
    print("\n" + "=" * 78)
    print(f"  Backtest summary — {summary['interval']}  "
          f"({summary['start']} → {summary['end']})")
    print("=" * 78)

    for pair, stats in summary["pairs"].items():
        print(f"\n  {pair}  ({stats['candles']} bars)")
        b = stats["bos"]
        s = stats["setups"]
        n = stats["baseline"]
        print(f"    BOS events            : {b['total']}")
        print(f"    BOS continuation rate : {b['continuation_rate_decided']:.1%} "
              f"(of decided), {b['continuation_rate_all']:.1%} (of all)")
        print(f"    Setups detected       : {s['total']}  "
              f"(closed {s['closed']}, open {s['open_or_no_touch']})")
        print(f"    Setup win rate        : {s['win_rate']:.1%}")
        print(f"    Setup avg planned R:R : {s['avg_planned_rr']:.2f}")
        print(f"    Setup avg realised R  : {s['avg_realised_r']:+.2f}")
        print(f"    Setup total R         : {s['total_r']:+.2f}")
        print(f"    Baseline win rate     : {n['win_rate']:.1%} "
              f"(n={n['closed']}, total R={n['total_r']:+.2f})")

    a = summary["aggregate"]
    print("\n  AGGREGATE")
    print(f"    BOS continuation rate : {a['bos']['continuation_rate_decided']:.1%} "
          f"(decided), {a['bos']['continuation_rate_all']:.1%} (all)  "
          f"n={a['bos']['total']}")
    print(f"    Setup win rate        : {a['setups']['win_rate']:.1%}  "
          f"n_closed={a['setups']['closed']}")
    print(f"    Setup avg planned R:R : {a['setups']['avg_planned_rr']:.2f}")
    print(f"    Setup avg realised R  : {a['setups']['avg_realised_r']:+.2f}")
    print(f"    Setup total R         : {a['setups']['total_r']:+.2f}")
    print(f"    Baseline win rate     : {a['baseline']['win_rate']:.1%}  "
          f"n_closed={a['baseline']['closed']}  "
          f"total R={a['baseline']['total_r']:+.2f}")
    print("=" * 78 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Walk-forward backtest for graewatch.")
    parser.add_argument(
        "--pairs", nargs="+", default=["EUR/USD", "GBP/USD", "USD/JPY"],
        help="Forex pairs to evaluate.",
    )
    parser.add_argument(
        "--interval", default="daily",
        choices=list(TWELVE_DATA_INTERVAL_MAP.keys()),
        help="Bar interval (default: daily).",
    )
    parser.add_argument("--start", default="2023-01-01")
    parser.add_argument("--end", default="2024-12-31")
    parser.add_argument(
        "--out", default=str(SERVER_ROOT / "eval" / "results"),
        help="Output directory for CSVs and summary JSON.",
    )
    args = parser.parse_args()

    api_key = os.getenv("TWELVE_DATA_API_KEY")
    if not api_key:
        print("ERROR: TWELVE_DATA_API_KEY missing from environment / .env",
              file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out)
    summary = asyncio.run(
        run(args.pairs, args.interval, args.start, args.end, out_dir, api_key)
    )
    print_table(summary)
    print(f"Results written to {out_dir}")


if __name__ == "__main__":
    main()
