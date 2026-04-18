"""
Zone prediction types.

These TypedDicts define the contracts between the adapters, scorer, and
clustering step.  All engine functions use plain dicts that match these
shapes — TypedDicts are here for editor support and documentation only.
"""

from __future__ import annotations

from typing import TypedDict


class Zone(TypedDict):
    """An unmitigated, bias-aligned price zone derived from a signal."""

    source_type: str  # "fvg" | "ob" | "wyckoff"
    direction: str    # "bullish" | "bearish"
    top: float
    bottom: float
    timestamp: str
    end_timestamp: str | None  # None = zone is still active


class Context(TypedDict):
    """Market context that was used to filter and score zones."""

    bias: str              # "bullish" | "bearish" | "neutral"
    htf_bias_source: str   # "htf_bos" | "current_bos" | "neutral"
    current_close: float
    atr: float
    htf_interval: str | None


class ScoreBreakdown(TypedDict):
    type: float       # base score for zone source type
    proximity: float  # linear decay based on distance from current price
    at_poi: float     # bonus when price is at or near the zone
    liquidity: float  # bonus when an unswept liq pool is adjacent
    cluster: float    # bonus added by the clustering step


class ScoredZone(TypedDict):
    """A Zone with score metadata attached — output of score_zone()."""

    source_type: str
    direction: str
    top: float
    bottom: float
    timestamp: str
    end_timestamp: str | None
    score: float
    score_breakdown: ScoreBreakdown
    cluster_size: int         # 1 = standalone; >1 = merged cluster
    confluence_types: list    # source_type values for every zone in cluster
