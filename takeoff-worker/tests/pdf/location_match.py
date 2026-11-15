"""One-to-one location match for a manual survey against engine marks.

The distance limit is the symbol size on that sheet. Coordinates of a named
plan are a survey. They are not an input to detection.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Mark:
    id: str
    x: float
    y: float


@dataclass(frozen=True)
class LocationMatch:
    correct: tuple[tuple[str, str], ...]
    missed: tuple[str, ...]
    false: tuple[str, ...]


def _dist(a: Mark, b: Mark) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def match_locations(manual: list[Mark], found: list[Mark], limit: float) -> LocationMatch:
    """Pair each manual mark with at most one found mark.

    The nearer manual claim wins when two surveys fall inside the same limit.
    A found mark with no pair is false. A manual mark with no pair was missed.
    """
    if limit <= 0:
        raise ValueError("limit must be positive")
    pairs: list[tuple[float, int, int]] = []
    for mi, manual_mark in enumerate(manual):
        for fi, found_mark in enumerate(found):
            distance = _dist(manual_mark, found_mark)
            if distance <= limit:
                pairs.append((distance, mi, fi))
    pairs.sort()
    used_manual: set[int] = set()
    used_found: set[int] = set()
    correct: list[tuple[str, str]] = []
    for _distance, mi, fi in pairs:
        if mi in used_manual or fi in used_found:
            continue
        used_manual.add(mi)
        used_found.add(fi)
        correct.append((manual[mi].id, found[fi].id))
    missed = tuple(mark.id for i, mark in enumerate(manual) if i not in used_manual)
    false = tuple(mark.id for i, mark in enumerate(found) if i not in used_found)
    return LocationMatch(tuple(correct), missed, false)
