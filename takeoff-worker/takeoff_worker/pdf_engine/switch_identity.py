"""Geometric identity for switch heads.

Two detections of one drawn head are one switch. Heads separated by a gap
stay two switches, even when they sit near each other in a bank.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

# Center distance must be strictly below this fraction of the summed radii.
_OVERLAP_FACTOR = 0.85
# Unit stem directions at or above this dot product still describe one switch.
_SAME_STEM_DOT = 0.5


@dataclass(frozen=True)
class SwitchMark:
    """One switch head: center, positive radius, and an optional stem direction.

    ``stem`` is ``(dx, dy)`` in the same space as the center, or ``None`` when
    the detection has no stem. The pair does not need to be a unit vector.
    """

    x: float
    y: float
    head_radius: float
    stem: tuple[float, float] | None = None

    def __post_init__(self) -> None:
        radius = self.head_radius
        if isinstance(radius, bool) or not isinstance(radius, (int, float)):
            raise TypeError("head_radius must be a positive float")
        if not math.isfinite(radius) or radius <= 0:
            raise ValueError("head_radius must be a positive float")


def same_head(a: SwitchMark, b: SwitchMark) -> bool:
    """True when the heads overlap.

    Overlap means the center distance is strictly less than
    ``0.85 * (radius_a + radius_b)``. A distance at or beyond that limit is a
    gap, so the heads are different switches.
    """

    limit = _OVERLAP_FACTOR * (a.head_radius + b.head_radius)
    return math.hypot(a.x - b.x, a.y - b.y) < limit


def collapse_same_head(marks: Sequence[SwitchMark]) -> list[SwitchMark]:
    """Return one input mark for each same-switch cluster.

    An edge exists when :func:`same_head` is true, unless both marks have a
    usable stem direction and the dot product of those unit directions is
    strictly below 0.5. That split covers stems that leave in clearly different
    directions, including opposite stems. If either direction is missing or
    has zero length, the distance test decides alone. Clusters are the
    transitive closure of those edges.

    Each cluster keeps the input mark with the larger head radius. Equal radii
    keep the earlier mark. Coordinates are never averaged onto a new point.
    Clusters are returned in order of their earliest input mark.
    """

    items = list(marks)
    count = len(items)
    parent = list(range(count))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def unite(left: int, right: int) -> None:
        root_left = find(left)
        root_right = find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    for i in range(count):
        for j in range(i + 1, count):
            if _same_switch(items[i], items[j]):
                unite(i, j)

    groups: dict[int, list[int]] = {}
    for index in range(count):
        groups.setdefault(find(index), []).append(index)

    collapsed: list[SwitchMark] = []
    for indexes in sorted(groups.values(), key=lambda group: group[0]):
        best = indexes[0]
        for index in indexes[1:]:
            if items[index].head_radius > items[best].head_radius:
                best = index
        collapsed.append(items[best])
    return collapsed


def _same_switch(a: SwitchMark, b: SwitchMark) -> bool:
    if not same_head(a, b):
        return False
    dot = _unit_dot(a, b)
    if dot is None:
        return True
    return dot >= _SAME_STEM_DOT


def _unit_dot(a: SwitchMark, b: SwitchMark) -> float | None:
    direction_a = _unit_direction(a.stem)
    direction_b = _unit_direction(b.stem)
    if direction_a is None or direction_b is None:
        return None
    ax, ay = direction_a
    bx, by = direction_b
    return ax * bx + ay * by


def _unit_direction(stem: tuple[float, float] | None) -> tuple[float, float] | None:
    if stem is None:
        return None
    dx, dy = stem
    length = math.hypot(dx, dy)
    if length == 0.0 or not math.isfinite(length):
        return None
    return (dx / length, dy / length)
