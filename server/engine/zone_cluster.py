"""
Zone clustering.

Merges ScoredZones that overlap or whose midpoints are within 1 ATR.
Merged zones get a bonus (+10 per extra zone) to reward confluence.

The return list is sorted by score descending — the first element is the
highest-conviction zone the scoring engine found.
"""

from __future__ import annotations

from engine.zone_types import ScoredZone

_CLUSTER_BONUS_PER_ZONE = 10.0


def cluster_zones(zones: list[ScoredZone], atr: float) -> list[ScoredZone]:
    if not zones:
        return []

    sorted_zones = sorted(zones, key=lambda z: z["top"], reverse=True)
    used = [False] * len(sorted_zones)
    groups: list[list[ScoredZone]] = []

    for i, a in enumerate(sorted_zones):
        if used[i]:
            continue
        group = [a]
        used[i] = True
        mid_a = (a["top"] + a["bottom"]) / 2

        for j in range(i + 1, len(sorted_zones)):
            if used[j]:
                continue
            b = sorted_zones[j]
            overlapping = b["top"] >= a["bottom"] and a["top"] >= b["bottom"]
            close_enough = abs(mid_a - (b["top"] + b["bottom"]) / 2) <= atr
            if overlapping or close_enough:
                group.append(b)
                used[j] = True

        groups.append(group)

    result = [_merge(g) for g in groups]
    return sorted(result, key=lambda z: z["score"], reverse=True)


def _merge(group: list[ScoredZone]) -> ScoredZone:
    if len(group) == 1:
        return group[0]

    top = max(z["top"] for z in group)
    bottom = min(z["bottom"] for z in group)
    base = max(group, key=lambda z: z["score"])
    cluster_bonus = _CLUSTER_BONUS_PER_ZONE * (len(group) - 1)
    total_score = sum(z["score"] for z in group) + cluster_bonus

    breakdown = dict(base["score_breakdown"])
    breakdown["cluster"] = cluster_bonus

    return {
        **base,
        "top": top,
        "bottom": bottom,
        "score": round(total_score, 2),
        "score_breakdown": breakdown,
        "cluster_size": len(group),
        "confluence_types": list({z["source_type"] for z in group}),
    }
