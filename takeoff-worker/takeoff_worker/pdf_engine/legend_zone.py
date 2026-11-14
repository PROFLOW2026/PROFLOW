"""Legend / title-block zones on plan sheets (excluded from BOQ quantities)."""
from __future__ import annotations

import re
from typing import Optional

import numpy as np

from .geometry import PdfRect
from . import shape_engine as E

_KEYWORD = re.compile(r"מקרא|LEGEND|הסבר|הערות", re.I)


def _union_rect(comps: list[E.Comp], pad: float = 12.0) -> Optional[PdfRect]:
    if not comps:
        return None
    r = PdfRect(comps[0].rect.x0, comps[0].rect.y0, comps[0].rect.x1, comps[0].rect.y1)
    for c in comps[1:]:
        r = r | c.rect
    return PdfRect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad)


def _margin_legend_comps(comps: list[E.Comp], w: float, h: float) -> list[E.Comp]:
    """Symbols that belong to an in-sheet margin legend table, not the plan field."""
    out: list[E.Comp] = []
    for c in comps:
        cx = (c.rect.x0 + c.rect.x1) / 2
        cy = (c.rect.y0 + c.rect.y1) / 2
        in_bottom_right = cx > w * 0.72 and cy > h * 0.52
        in_bottom_left_table = cx < w * 0.24 and cy > h * 0.38
        in_right_strip = cx > w * 0.78 and h * 0.12 < cy < h * 0.88
        in_left_strip = cx < w * 0.22 and h * 0.12 < cy < h * 0.88
        if in_bottom_right or in_bottom_left_table or in_right_strip or in_left_strip:
            out.append(c)
    return out


def detect_legend_zones(
    page_size: tuple[float, float],
    words: list[dict],
    legend_comps: list[E.Comp],
    hint: Optional[PdfRect] = None,
    *,
    detections_xy: Optional[list[tuple[float, float, str]]] = None,
) -> list[PdfRect]:
    """Return regions where symbols are part of an in-sheet legend, not plan quantities."""
    w, h = page_size
    zones: list[PdfRect] = []
    if hint is not None:
        zones.append(hint)

    if hint is None and len(legend_comps) < 30:
        for wobj in words:
            text = (wobj.get("text") or "").strip()
            if not text or not _KEYWORD.search(text):
                continue
            r: PdfRect = wobj["rect"]
            # Tight band beside the keyword — avoid swallowing the plan field (AS1749/3643).
            if r.x0 > w * 0.45:
                zones.append(PdfRect(r.x0 - 50, r.y0 - 60, w - 8, r.y1 + min(h * 0.12, 140)))
            elif r.y0 > h * 0.72:
                zones.append(
                    PdfRect(max(20, r.x0 - 50), r.y0 - 25, min(w - 20, r.x1 + 180), min(h - 8, r.y1 + 80))
                )
            else:
                zones.append(PdfRect(r.x0 - 25, r.y0 - 25, r.x1 + 160, r.y1 + 80))

    # Right-margin column (3643 / AS1749 full-height) — exclude from plan quantities only
    margin = _margin_legend_comps(legend_comps, w, h)
    if 6 <= len(margin) < 100:
        z = _union_rect(margin, pad=6)
        if z and z.width < w * 0.35:
            zones.append(z)

    # Bottom title-block legend table (7155) — not right-column strips (3643 / AS1749)
    bottom_rows = [c for c in legend_comps if (c.rect.y0 + c.rect.y1) / 2 > h * 0.62]
    if len(bottom_rows) >= 8:
        xc = np.array([(c.rect.x0 + c.rect.x1) / 2 for c in bottom_rows])
        yc = np.array([(c.rect.y0 + c.rect.y1) / 2 for c in bottom_rows])
        bottom_table = float(np.median(xc)) < w * 0.55 or float(np.median(yc)) > h * 0.78
        if bottom_table:
            z = _union_rect(bottom_rows, pad=4)
            if z and z.height < h * 0.22:
                zones.append(z)

    if detections_xy:
        margin_hits = [p for p in detections_xy if p[2].startswith("L")]
        right_hits = [p for p in margin_hits if p[0] > w * 0.62]
        band_hits = [p for p in margin_hits if p[1] > h * 0.58]
        hits = right_hits if len(right_hits) >= 10 else band_hits
        if len(hits) >= 10:
            xs = [p[0] for p in hits]
            ys = [p[1] for p in hits]
            zones.append(
                PdfRect(
                    min(xs) - 20,
                    min(ys) - 15,
                    max(xs) + 20,
                    max(ys) + 15,
                )
            )

    return _merge_zones(zones, w, h)


def _merge_zones(zones: list[PdfRect], w: float, h: float) -> list[PdfRect]:
    if not zones:
        return []
    out: list[PdfRect] = []
    for z in zones:
        z = PdfRect(max(0, z.x0), max(0, z.y0), min(w, z.x1), min(h, z.y1))
        if z.width < 2 or z.height < 2:
            continue
        out.append(z)
    return out


def point_in_zones(x: float, y: float, zones: list[PdfRect]) -> bool:
    for z in zones:
        if z.contains_point(x, y):
            return True
    return False


def plan_field_rect(w: float, h: float) -> PdfRect:
    """Conservative main-drawing footprint (excludes typical margins / bottom title band)."""
    return PdfRect(w * 0.05, h * 0.05, w * 0.68, min(h * 0.58, h - 80))


def zone_false_positives_in_plan_field(
    excluded: list[E.Comp], w: float, h: float
) -> int:
    field = plan_field_rect(w, h)
    n = 0
    for c in excluded:
        cx = (c.rect.x0 + c.rect.x1) / 2
        cy = (c.rect.y0 + c.rect.y1) / 2
        if field.contains_point(cx, cy):
            n += 1
    return n


def filter_plan_comps(plan: list[E.Comp], zones: list[PdfRect]) -> tuple[list[E.Comp], list[E.Comp]]:
    keep: list[E.Comp] = []
    excluded: list[E.Comp] = []
    for c in plan:
        cx = (c.rect.x0 + c.rect.x1) / 2
        cy = (c.rect.y0 + c.rect.y1) / 2
        if point_in_zones(cx, cy, zones):
            excluded.append(c)
        else:
            keep.append(c)
    return keep, excluded