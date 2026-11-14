"""Automatic legend region + row extraction."""
from __future__ import annotations

from typing import Optional

import numpy as np

from .geometry import PdfRect
from .generic_ops import core_components, legend_symbol_comps
from . import shape_engine as E


def _column_filtered(leg2: list[E.Comp], *, col_tol: float = 5.0, min_col: int = 5) -> list[E.Comp]:
    if len(leg2) < min_col:
        return []
    xc = np.array([(c.rect.x0 + c.rect.x1) / 2 for c in leg2])
    thr = max(min_col, len(leg2) // 20)
    keep = [k for k in range(len(leg2)) if (np.abs(xc - xc[k]) <= col_tol).sum() >= thr]
    return [leg2[k] for k in keep]


def auto_legend_components(drawings, M, page_size: tuple[float, float], hint: Optional[PdfRect] = None) -> tuple[list[E.Comp], Optional[PdfRect]]:
    """Find legend column(s) or use hint override."""
    w, h = page_size
    if hint is not None:
        region = hint
    else:
        # Full-height right legend column (AS1749) before the shallow top band.
        for full_col in (
            PdfRect(w * 0.70, h * 0.04, w * 0.985, h * 0.96),
            PdfRect(w * 0.015, h * 0.04, w * 0.28, h * 0.96),
        ):
            leg_full = core_components(drawings, M, full_col, min_ext=4.0, max_ext=65.0, merge_small_tol=2.0)
            sym_full = _column_filtered(leg_full, col_tol=6.0, min_col=8)
            if len(sym_full) >= 8:
                return sorted(sym_full, key=lambda c: (c.rect.y0 + c.rect.y1) / 2), full_col
        region = PdfRect(w * 0.72, h * 0.05, w * 0.98, h * 0.45)
    # multi-colour rows (3643 / shallow bands)
    leg2 = core_components(drawings, M, region, min_ext=4.0, max_ext=60.0, merge_small_tol=2.0)
    if len(leg2) >= 12:
        sym = _column_filtered(leg2, col_tol=4.0, min_col=5)
        if len(sym) >= 8:
            return sym, region
    # single-colour legend column
    sym = legend_symbol_comps(drawings, M, region, min_col=5, col_tol=4.0)
    if len(sym) >= 8:
        return sym, region
    # bottom / right margin table (7155 plan sheet copy of legend)
    bottom = PdfRect(w * 0.55, h * 0.62, w * 0.98, h * 0.97)
    leg_b = core_components(drawings, M, bottom, min_ext=4.0, max_ext=50.0, merge_small_tol=2.0)
    if len(leg_b) >= 8:
        return leg_b, bottom
    return sym, region


def is_legend_sheet(legend_comps: list[E.Comp], page_area: float) -> bool:
    from .heavy_guard import HeavyBudget

    cap = HeavyBudget.from_env().max_legend_rows
    if len(legend_comps) < 15 or len(legend_comps) > cap:
        return False
    area = sum(c.rect.width * c.rect.height for c in legend_comps)
    return area / max(page_area, 1) < 0.25


def plan_region(hint: Optional[PdfRect], legend_rect: Optional[PdfRect], page_size: tuple[float, float]) -> PdfRect:
    w, h = page_size
    if hint is not None:
        return hint
    _ = legend_rect  # embedded legend does not clip the plan by default
    return PdfRect(20, 20, w - 20, h - 20)


def filter_glyph_candidates(comps: list[E.Comp]) -> list[E.Comp]:
    """Drop text-outline rows (elongated tiny boxes)."""
    out: list[E.Comp] = []
    for c in comps:
        ar = c.rect.width / max(c.rect.height, 0.01)
        ext = max(c.rect.width, c.rect.height)
        if ext < 18 and (ar > 6 or ar < 0.2):
            continue
        if ext < 4:
            continue
        out.append(c)
    return out