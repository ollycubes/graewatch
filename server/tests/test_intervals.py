"""
Unit tests for routes/intervals.py — interval aliasing and timestamp snapping.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.intervals import (
    HTF_MAP,
    SUPPORTED_INTERVALS,
    TWELVE_DATA_INTERVAL_MAP,
    normalize_interval,
    normalize_timestamp,
)


# ── normalize_interval ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("weekly", "weekly"),
        ("1w", "weekly"),
        ("W", "weekly"),
        ("daily", "daily"),
        ("1D", "daily"),
        ("d", "daily"),
        ("4h", "4h"),
        ("240m", "4h"),
        ("240MIN", "4h"),
        ("1h", "1h"),
        ("60m", "1h"),
        ("60min", "1h"),
        ("15m", "15min"),
        ("15MIN", "15min"),
        ("  daily  ", "daily"),
    ],
)
def test_normalize_interval_maps_aliases(raw: str, expected: str):
    assert normalize_interval(raw) == expected


def test_normalize_interval_returns_none_for_empty():
    assert normalize_interval("") is None


def test_normalize_interval_returns_none_for_unknown_alias():
    assert normalize_interval("30s") is None
    assert normalize_interval("monthly") is None


def test_supported_intervals_matches_twelvedata_keys():
    """SUPPORTED_INTERVALS should be derived from the Twelve Data map."""
    assert set(SUPPORTED_INTERVALS) == set(TWELVE_DATA_INTERVAL_MAP.keys())


def test_htf_map_chains_through_to_weekly():
    """Walk the HTF chain from 15min and confirm it ends at weekly→None."""
    tf = "15min"
    chain = [tf]
    while HTF_MAP[tf] is not None:
        tf = HTF_MAP[tf]
        chain.append(tf)
    assert chain == ["15min", "1h", "4h", "daily", "weekly"]
    assert HTF_MAP["weekly"] is None


# ── normalize_timestamp ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ts,interval,expected",
    [
        # 15min snaps down to the nearest 15-minute mark.
        ("2024-01-02 13:07:42", "15min", "2024-01-02 13:00:00"),
        ("2024-01-02 13:29:59", "15min", "2024-01-02 13:15:00"),
        ("2024-01-02 13:45:00", "15min", "2024-01-02 13:45:00"),
        # 1h strips minutes and seconds.
        ("2024-01-02 13:45:12", "1h", "2024-01-02 13:00:00"),
        # 4h snaps to the nearest 4-hour mark.
        ("2024-01-02 05:59:00", "4h", "2024-01-02 04:00:00"),
        ("2024-01-02 17:00:00", "4h", "2024-01-02 16:00:00"),
        # daily + weekly both strip the time-of-day.
        ("2024-01-02 17:30:00", "daily", "2024-01-02 00:00:00"),
        ("2024-01-02 17:30:00", "weekly", "2024-01-02 00:00:00"),
    ],
)
def test_normalize_timestamp_snaps_to_interval_start(ts, interval, expected):
    assert normalize_timestamp(ts, interval) == expected


def test_normalize_timestamp_accepts_date_only_input():
    """A bare YYYY-MM-DD input is parsed (no time component)."""
    assert normalize_timestamp("2024-01-02", "daily") == "2024-01-02 00:00:00"


def test_normalize_timestamp_raises_on_unparseable_input():
    with pytest.raises(ValueError):
        normalize_timestamp("not-a-date", "daily")
