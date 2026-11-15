"""Match a plan mark to the legend symbol it actually looks like.

A lighting point is a circle. A switch on these sheets is that same circle with a
stem, and the stem is often longer on the plan than in the legend. Chamfer on the
whole enclosing circle then prefers the plain circle, or misses entirely. Anchor
both masks on the round head and only then compare marks that have a stem with
legend symbols that have a stem.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from . import shape_engine as E


@dataclass(frozen=True)
class _Head:
    cx: float
    cy: float
    rad: float


def circular_head(mask: np.ndarray) -> _Head | None:
    """The round body of a symbol, when the mask has one."""
    if mask is None or mask.size == 0 or int(np.count_nonzero(mask)) < 12:
        return None
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    best: tuple[float, float, float, float] | None = None
    for contour in contours:
        if len(contour) < 8:
            continue
        (cx, cy), rad = cv2.minEnclosingCircle(contour)
        if rad < 4.0:
            continue
        _x, _y, w, h = cv2.boundingRect(contour)
        aspect = w / max(h, 1)
        if not (0.65 <= aspect <= 1.55):
            continue
        area = float(cv2.contourArea(contour))
        circ = area / (np.pi * rad * rad + 1e-6)
        if best is None or circ > best[0]:
            best = (circ, float(cx), float(cy), float(rad))
    if best is None or best[0] < 0.35:
        return None
    return _Head(best[1], best[2], best[3])


def has_stem(mask: np.ndarray, head: _Head | None = None) -> bool:
    """True when ink continues outside the round head (a switch or socket stem)."""
    found = head if head is not None else circular_head(mask)
    if found is None:
        return False
    ys, xs = np.nonzero(mask)
    if len(ys) < 12:
        return False
    outside = (xs - found.cx) ** 2 + (ys - found.cy) ** 2 > (1.35 * found.rad) ** 2
    return float(outside.mean()) >= 0.07


def outside_is_bar(mask: np.ndarray, head: _Head | None = None) -> bool:
    """True when the ink outside the head is one thin stem, not a caption or a cross.

    A switch stem is a bar that leaves the circle. Digits and a room label sitting
    next to an open circle also leave the circle, and they must not become a switch.
    """
    found = head if head is not None else circular_head(mask)
    if found is None:
        return False
    ys, xs = np.nonzero(mask)
    if len(ys) < 12:
        return False
    dist2 = (xs - found.cx) ** 2 + (ys - found.cy) ** 2
    outside = dist2 > (1.20 * found.rad) ** 2
    if int(outside.sum()) < 6:
        return False
    ox = xs[outside].astype(float)
    oy = ys[outside].astype(float)
    width = float(ox.max() - ox.min() + 1.0)
    height = float(oy.max() - oy.min() + 1.0)
    long = max(width, height)
    short = min(width, height)
    # A caption is chunky. A stem, including the legend's end tick, stays thin.
    if long < 5.0 or short > max(5.0, 0.45 * long):
        return False
    # The bar has to leave the head. A floating label does not touch it.
    touch = (dist2 > (1.05 * found.rad) ** 2) & (dist2 <= (1.85 * found.rad) ** 2)
    return int(touch.sum()) >= 3


def head_center_pt(comp: E.Comp) -> tuple[float, float] | None:
    """PDF point of the round head. The component center is pulled toward a stem."""
    head = circular_head(comp.mask)
    if head is None or comp.rad < 0.3 or comp.mask.size == 0:
        return None
    scale = (comp.mask.shape[0] * 0.46) / comp.rad
    if scale <= 0:
        return None
    cx, cy = comp.center
    return (
        float(cx + (head.cx - comp.mask.shape[1] / 2.0) / scale),
        float(cy + (head.cy - comp.mask.shape[0] / 2.0) / scale),
    )


def anchored_mask(mask: np.ndarray, head: _Head | None = None) -> np.ndarray | None:
    """Redraw so the round head is a fixed size. A long stem keeps only its stub."""
    found = head if head is not None else circular_head(mask)
    if found is None:
        return None
    out = np.zeros_like(mask)
    scale = 16.0 / max(found.rad, 1.0)
    ys, xs = np.nonzero(mask)
    keep = (xs - found.cx) ** 2 + (ys - found.cy) ** 2 <= (2.8 * found.rad) ** 2
    if not np.any(keep):
        return None
    nx = np.clip((32 + (xs[keep] - found.cx) * scale).astype(int), 0, 63)
    ny = np.clip((32 + (ys[keep] - found.cy) * scale).astype(int), 0, 63)
    out[ny, nx] = 255
    return cv2.dilate(out, np.ones((2, 2), np.uint8))


def _comp_from_mask(mask: np.ndarray) -> E.Comp:
    comp = E.Comp.__new__(E.Comp)
    comp.mask = mask
    comp.ys, comp.xs = E.pts_of(mask)
    comp.dt = E.dt_of(mask)
    comp.rad = 8.0
    comp.colors = {}
    comp.n = 1
    return comp


@dataclass
class StemTemplates:
    keys: list[str]
    comps: list[E.Comp]


def stemmed_templates(templates: list[tuple[str, E.Comp]]) -> StemTemplates:
    keys: list[str] = []
    comps: list[E.Comp] = []
    for key, comp in templates:
        head = circular_head(comp.mask)
        if not has_stem(comp.mask, head):
            continue
        anchored = anchored_mask(comp.mask, head)
        if anchored is None:
            continue
        keys.append(key)
        comps.append(_comp_from_mask(anchored))
    return StemTemplates(keys, comps)


def best_stem_match(
    comp: E.Comp,
    stemmed: StemTemplates,
    tau: float,
) -> tuple[str, float, float] | None:
    """Legend key of the stemmed symbol this mark looks like, or None.

    A plain circle is not compared here. Callers keep the ordinary chamfer for it.
    """
    if not stemmed.keys:
        return None
    head = circular_head(comp.mask)
    if not has_stem(comp.mask, head):
        return None
    anchored = anchored_mask(comp.mask, head)
    if anchored is None:
        return None
    pairs = list(zip(stemmed.keys, stemmed.comps))
    scores, _angles, _ratios = E.match([_comp_from_mask(anchored)], pairs, size_gate=None)
    order = np.argsort(scores[:, 0])
    best = float(scores[int(order[0]), 0])
    second = float(scores[int(order[1]), 0]) if len(order) > 1 else 9.9
    if best > tau:
        return None
    # A stub must look like one legend symbol, not like several at once.
    if second - best < 0.25:
        return None
    return stemmed.keys[int(order[0])], best, second - best
