"""Pure geometric classifiers for a lighting point and a socket symbol.

The caller measures one candidate and fills a frozen feature record. These
predicates only read that record (or the point against its own page). They
match the meaning in ``open_circle_marks`` and ``stair_marker_ring``:

- a lighting point is an empty open ring
- a short stroke leaving the rim is a switch head, not a light
- four or more gray strokes inside the ring are a filled arrow tip
- a letter, a cross, or a second ring inside is not a light
- a ring sitting in a fan of long diagonals is a stair marker, not a luminaire
- a socket is one goalpost arch plus one short stem, never a full circle

Nothing here knows a project coordinate or a sheet count.
"""
from __future__ import annotations

from dataclasses import dataclass

# Same window ``open_circle_marks`` keeps for an empty ring.
_LIGHT_EXTENT_MIN = 12.0
_LIGHT_EXTENT_MAX = 20.0
_LIGHT_ASPECT_MIN = 0.82
_LIGHT_ASPECT_MAX = 1.22
# ``_gray_in_ring`` treats four gray strokes as the filled stair-arrow tip.
_LIGHT_GRAY_INSIDE_MAX = 4

# Share of the page width or height. A point this close to that edge can be
# the drawn frame; anything further in is the sheet, including an exterior wall.
_SHEET_EDGE_FRACTION = 0.025


@dataclass(frozen=True)
class LightingPointFeatures:
    """One ring, measured against itself.

    ``aspect`` is width / height. ``gray_inside`` is the count of gray strokes
    inside the ring. ``inner_mark`` is a letter, a cross, or a second ring.
    ``word_inside`` is a text glyph whose center lies inside half the radius.
    ``has_stem`` is one short stroke leaving the rim. ``in_arrow_fan`` is
    several long diagonals around the ring.
    """

    extent: float
    aspect: float
    gray_inside: int
    inner_mark: bool
    word_inside: bool
    has_stem: bool
    in_arrow_fan: bool
    on_sheet_border: bool


@dataclass(frozen=True)
class SocketSymbolFeatures:
    """One socket candidate.

    ``arch`` is a curved goalpost arch, not a full circle. ``stem`` is the one
    short bar leaving that arch. A cluster is not a feature: the caller has
    already decided this is a single symbol.
    """

    arch: bool
    stem: bool
    on_sheet_border: bool
    in_arrow_fan: bool


def lighting_point(features: LightingPointFeatures) -> bool:
    """An empty open ring of lighting-point size.

    A switch head, a gray filled tip, a lettered circle, a bullseye, a stair
    arrow fan, and a sheet-frame ring are all rejected.
    """
    if not (_LIGHT_EXTENT_MIN <= features.extent <= _LIGHT_EXTENT_MAX):
        return False
    if not (_LIGHT_ASPECT_MIN <= features.aspect <= _LIGHT_ASPECT_MAX):
        return False
    if features.gray_inside >= _LIGHT_GRAY_INSIDE_MAX:
        return False
    if features.inner_mark or features.word_inside or features.has_stem:
        return False
    if features.in_arrow_fan or features.on_sheet_border:
        return False
    return True


def socket_symbol(features: SocketSymbolFeatures) -> bool:
    """One goalpost: the arch and the single stem that leaves it.

    A full circle has no arch, so it is not a socket. The sheet frame and an
    arrow fan are not a socket either.
    """
    if not features.arch or not features.stem:
        return False
    if features.on_sheet_border or features.in_arrow_fan:
        return False
    return True


def _near_page_edge(coord: float, span: float) -> bool:
    """True when ``coord`` is within 2.5% of either end of this page axis."""
    if span <= 0:
        return False
    margin = _SHEET_EDGE_FRACTION * span
    return abs(coord) <= margin or abs(coord - span) <= margin


def on_sheet_border(
    cx: float,
    cy: float,
    page_w: float,
    page_h: float,
    ink_reaches_edge: bool,
) -> bool:
    """The drawn sheet frame, not an exterior wall and not a middle band.

    True only when the point is within 2.5% of a page edge and a line of the
    frame touches that same edge (``ink_reaches_edge``). Distance is a fraction
    of the page width for the left and right edges, and of the page height for
    the top and bottom. A point in the middle of the sheet stays false.
    """
    if not ink_reaches_edge or page_w <= 0 or page_h <= 0:
        return False
    return _near_page_edge(cx, page_w) or _near_page_edge(cy, page_h)
