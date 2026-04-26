"""
Per-engine performance benchmark used by dissertation section 6.3.

Run from the `server/` directory:

    python eval/run_perf.py                           # EUR/USD daily, sizes [500, 1000, 5000]
    python eval/run_perf.py --sizes 1000              # single-size benchmark
    python eval/run_perf.py --interval 4h --runs 50   # tighter timings on 4h

Each detector and the full pipeline are run `--runs` times per size
after one warm-up call. Reports mean / p50 / p95 / p99 / max and writes
a JSON summary under `server/eval/results/`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Callable

import httpx
from dotenv import load_dotenv

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
from utils.precision import convert_candles_to_decimal  # noqa: E402

TD_BASE_URL = "https://api.twelvedata.com/time_series"

ENGINE_ORDER = ["bos", "fvg", "orderblocks", "liquidity", "wyckoff", "gann", "setup", "FULL_PIPELINE"]


# ── TwelveData fetch ─────────────────────────────────────────────────────────


async def fetch_td(pair: str, interval: str, n_candles: int, api_key: str) -> list[dict]:
    params = {
        "symbol": pair,
        "interval": TWELVE_DATA_INTERVAL_MAP[interval],
        "outputsize": n_candles,
        "order": "asc",
        "apikey": api_key,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(TD_BASE_URL, params=params)
        data = response.json()
    if "values" not in data:
        raise RuntimeError(f"TwelveData error for {pair} {interval}: {data}")
    candles = [
        {
            "timestamp": normalize_timestamp(item["datetime"], interval),
            "open": item["open"],
            "high": item["high"],
            "low": item["low"],
            "close": item["close"],
        }
        for item in data["values"]
    ]
    candles.sort(key=lambda c: c["timestamp"])
    return candles


# ── Timing helpers ───────────────────────────────────────────────────────────


def quantile(values: list[float], q: float) -> float:
    s = sorted(values)
    if not s:
        return 0.0
    idx = int(round(q * (len(s) - 1)))
    return s[idx]


def time_runs(label: str, fn: Callable[[], Any], runs: int) -> dict[str, Any]:
    fn()  # warm-up
    durations_ms: list[float] = []
    for _ in range(runs):
        t0 = time.perf_counter()
        fn()
        durations_ms.append((time.perf_counter() - t0) * 1000.0)
    return {
        "label": label,
        "runs": runs,
        "mean_ms": statistics.mean(durations_ms),
        "stdev_ms": statistics.stdev(durations_ms) if len(durations_ms) > 1 else 0.0,
        "p50_ms": statistics.median(durations_ms),
        "p95_ms": quantile(durations_ms, 0.95),
        "p99_ms": quantile(durations_ms, 0.99),
        "max_ms": max(durations_ms),
        "min_ms": min(durations_ms),
    }


# ── Benchmark a single input size ────────────────────────────────────────────


def benchmark_size(
    candles: list[dict],
    htf_candles: list[dict],
    htf_interval: str | None,
    runs: int,
) -> list[dict]:
    """Run each engine + the full pipeline `runs` times on the given inputs."""
    results: list[dict] = []

    detectors = [
        ("bos", lambda: bos_detect(candles)),
        ("fvg", lambda: fvg_detect(candles)),
        ("orderblocks", lambda: ob_detect(candles)),
        ("liquidity", lambda: liq_detect(candles)),
        ("wyckoff", lambda: wyckoff_detect(candles)),
        ("gann", lambda: gann_detect(candles)),
    ]
    for name, fn in detectors:
        results.append(time_runs(name, fn, runs))

    # Pre-compute signals so the setup detector measurement excludes them.
    bos_sigs = bos_detect(candles)
    fvg_sigs = fvg_detect(candles)
    ob_sigs = ob_detect(candles)
    liq_sigs = liq_detect(candles)
    wyck_sigs = wyckoff_detect(candles)
    htf_bos = bos_detect(htf_candles) if htf_candles else []
    htf_gann = gann_detect(htf_candles) if htf_candles else []

    results.append(
        time_runs(
            "setup",
            lambda: setup_detect(
                candles=candles,
                bos_signals=bos_sigs,
                fvg_signals=fvg_sigs,
                ob_signals=ob_sigs,
                liq_signals=liq_sigs,
                htf_bos_signals=htf_bos,
                htf_gann_signals=htf_gann,
                htf_candles=htf_candles,
                wyckoff_signals=wyck_sigs,
                htf_interval=htf_interval,
            ),
            runs,
        )
    )

    def full_pipeline() -> Any:
        b = bos_detect(candles)
        f = fvg_detect(candles)
        o = ob_detect(candles)
        liq = liq_detect(candles)
        w = wyckoff_detect(candles)
        hb = bos_detect(htf_candles) if htf_candles else []
        hg = gann_detect(htf_candles) if htf_candles else []
        return setup_detect(
            candles=candles,
            bos_signals=b,
            fvg_signals=f,
            ob_signals=o,
            liq_signals=liq,
            htf_bos_signals=hb,
            htf_gann_signals=hg,
            htf_candles=htf_candles,
            wyckoff_signals=w,
            htf_interval=htf_interval,
        )

    results.append(time_runs("FULL_PIPELINE", full_pipeline, runs))
    return results


# ── Pretty-printing ──────────────────────────────────────────────────────────


def print_size_table(size_label: str, n: int, results: list[dict]) -> None:
    print(f"\n  {size_label}  (n_candles = {n})")
    print(f"  {'Engine':<16}{'mean':>10}{'p50':>10}{'p95':>10}{'p99':>10}{'max':>10}")
    print("  " + "-" * 66)
    by_label = {r["label"]: r for r in results}
    for name in ENGINE_ORDER:
        r = by_label.get(name)
        if r is None:
            continue
        print(
            f"  {r['label']:<16}"
            f"{r['mean_ms']:>8.2f}ms"
            f"{r['p50_ms']:>8.2f}ms"
            f"{r['p95_ms']:>8.2f}ms"
            f"{r['p99_ms']:>8.2f}ms"
            f"{r['max_ms']:>8.2f}ms"
        )


def print_scaling(summary: dict[str, Any]) -> None:
    """Cross-size scaling table: mean ms per engine across input sizes."""
    sizes = [s["n_candles"] for s in summary["sizes"]]
    if len(sizes) < 2:
        return
    print("\n  Scaling — mean ms per engine across input sizes")
    header = "  " + "Engine".ljust(16) + "".join(f"{n:>10}" for n in sizes)
    print(header)
    print("  " + "-" * (16 + 10 * len(sizes)))
    for name in ENGINE_ORDER:
        row_means: list[str] = []
        for s in summary["sizes"]:
            r = next((x for x in s["results"] if x["label"] == name), None)
            row_means.append(f"{r['mean_ms']:>8.2f}ms" if r else f"{'-':>10}")
        print("  " + name.ljust(16) + "".join(row_means))


# ── Orchestration ────────────────────────────────────────────────────────────


async def main_async(args: argparse.Namespace) -> None:
    api_key = os.getenv("TWELVE_DATA_API_KEY")
    if not api_key:
        print("ERROR: TWELVE_DATA_API_KEY missing from environment / .env", file=sys.stderr)
        sys.exit(1)

    max_size = max(args.sizes)
    print(f"Fetching {max_size} {args.interval} candles for {args.pair}…")
    raw = await fetch_td(args.pair, args.interval, max_size, api_key)
    candles_full = convert_candles_to_decimal(raw)
    print(f"Got {len(candles_full)} {args.interval} candles")

    htf_interval = HTF_MAP.get(args.interval)
    htf_candles_full: list[dict] = []
    if htf_interval:
        print(f"Fetching HTF ({htf_interval}) candles…")
        htf_raw = await fetch_td(args.pair, htf_interval, max_size, api_key)
        htf_candles_full = convert_candles_to_decimal(htf_raw)
        print(f"Got {len(htf_candles_full)} {htf_interval} HTF candles")

    summary: dict[str, Any] = {
        "pair": args.pair,
        "interval": args.interval,
        "htf_interval": htf_interval,
        "runs": args.runs,
        "sizes": [],
    }

    print(f"\nBenchmarking {args.runs} runs at each of {args.sizes}…")
    for n in args.sizes:
        n_eff = min(n, len(candles_full))
        slice_candles = candles_full[-n_eff:]
        # Use the most recent HTF candles, capped at min(n, available).
        htf_n = min(n_eff, len(htf_candles_full))
        slice_htf = htf_candles_full[-htf_n:] if htf_candles_full else []

        results = benchmark_size(slice_candles, slice_htf, htf_interval, args.runs)
        size_block = {
            "n_candles": n_eff,
            "n_htf_candles": len(slice_htf),
            "results": results,
        }
        summary["sizes"].append(size_block)
        print_size_table(f"size = {n}", n_eff, results)

    print_scaling(summary)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"perf_{args.interval}.json"
    out_file.write_text(json.dumps(summary, indent=2))
    print(f"\nResults written to {out_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Per-engine performance benchmark.")
    parser.add_argument("--pair", default="EUR/USD")
    parser.add_argument(
        "--interval",
        default="daily",
        choices=list(TWELVE_DATA_INTERVAL_MAP.keys()),
    )
    parser.add_argument(
        "--sizes",
        nargs="+",
        type=int,
        default=[500, 1000, 5000],
        help="Input sizes (candle counts) to benchmark.",
    )
    parser.add_argument("--runs", type=int, default=30)
    parser.add_argument("--out", default=str(SERVER_ROOT / "eval" / "results"))
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
