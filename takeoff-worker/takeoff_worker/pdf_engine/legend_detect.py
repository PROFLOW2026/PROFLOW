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
    mono, mono_rect = _monochrome_legend_column(drawings, M, (w, h))
    if len(mono) >= 8 and len(mono) >= len(sym):
        return mono, mono_rect
    return sym, region


def _monochrome_legend_column(drawings, M, page_size: tuple[float, float]) -> tuple[list[E.Comp], Optional[PdfRect]]:
    """Black legend rows beside a tall rule when the text layer has no Hebrew.

    A legend table is a long thin vertical stroke with a stack of symbol-sized
    marks on one side. Letter shapes on the other side are not returned.
    """
    from collections import Counter

    w, h = page_size
    best: list[E.Comp] = []
    best_rect: Optional[PdfRect] = None
    for rule in _vertical_rules(drawings, M, w, h):
        for side in ("right", "left"):
            rows = _symbols_beside_rule(drawings, M, rule, side, Counter)
            if len(rows) > len(best):
                best = rows
                best_rect = rule
    best.sort(key=lambda c: ((c.rect.y0 + c.rect.y1) / 2, (c.rect.x0 + c.rect.x1) / 2))
    return best, best_rect


def _vertical_rules(drawings, M, page_w: float, page_h: float) -> list[PdfRect]:
    rules: list[PdfRect] = []
    for drawing in drawings:
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        if rect.height < max(180.0, page_h * 0.12):
            continue
        if rect.width > 8.0 or rect.height < rect.width * 12.0:
            continue
        cx = (rect.x0 + rect.x1) / 2
        if cx < page_w * 0.08 or cx > page_w * 0.96:
            continue
        rules.append(rect)
    rules.sort(key=lambda r: -r.height)
    return rules[:12]


def _symbols_beside_rule(drawings, M, rule: PdfRect, side: str, counter_cls) -> list[E.Comp]:
    # Symbol cells sit in a narrow band. A wider window swallows the Hebrew labels.
    if side == "right":
        x0, x1 = rule.x1 + 1.5, rule.x1 + 90.0
    else:
        x0, x1 = rule.x0 - 90.0, rule.x0 - 1.5
    pieces: list[tuple[int, PdfRect]] = []
    for i, drawing in enumerate(drawings):
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        if rect.x1 < x0 or rect.x0 > x1:
            continue
        if rect.y1 < rule.y0 - 2 or rect.y0 > rule.y1 + 2:
            continue
        if max(rect.width, rect.height) > 48.0:
            continue
        # Row rules and leader lines are not symbols.
        if rect.width > 26.0 and rect.height < 4.5:
            continue
        pieces.append((i, rect))
    if len(pieces) < 8:
        return []
    # Stroke centers inside one symbol sit within ~5pt. The next legend row is
    # farther. A 12pt center gap merges the tighter switch/socket rows into one
    # blob taller than a symbol, and that blob is then discarded.
    pieces.sort(key=lambda item: ((item[1].y0 + item[1].y1) / 2, item[1].x0))
    raw_bands: list[list[tuple[int, PdfRect]]] = []
    current: list[tuple[int, PdfRect]] = []
    for item in pieces:
        cy = (item[1].y0 + item[1].y1) / 2
        prev = (current[-1][1].y0 + current[-1][1].y1) / 2 if current else cy
        if current and cy - prev > 8.0:
            raw_bands.append(current)
            current = []
        current.append(item)
    if current:
        raw_bands.append(current)
    comps: list[E.Comp] = []
    for band in raw_bands:
        for group in _split_symbol_band(band):
            for row in _split_tall_row(group):
                comp = _comp_if_symbol(row, drawings, M, counter_cls)
                if comp is not None:
                    comps.append(comp)
    if len(comps) < 8:
        return []
    ys = sorted((c.rect.y0 + c.rect.y1) / 2 for c in comps)
    gaps = sorted(ys[i + 1] - ys[i] for i in range(len(ys) - 1))
    if not gaps or gaps[len(gaps) // 2] > 55.0:
        return []
    return comps


def _split_symbol_band(band: list[tuple[int, PdfRect]]) -> list[list[tuple[int, PdfRect]]]:
    """Split two symbols drawn side by side on one legend row."""
    ordered = sorted(band, key=lambda item: item[1].x0)
    groups: list[list[tuple[int, PdfRect]]] = [[ordered[0]]]
    edge = ordered[0][1].x1
    for item in ordered[1:]:
        if item[1].x0 - edge > 7.0:
            groups.append([item])
        else:
            groups[-1].append(item)
        edge = max(edge, item[1].x1)
    return groups


def _split_tall_row(group: list[tuple[int, PdfRect]]) -> list[list[tuple[int, PdfRect]]]:
    """Break a stack that the center gap still joined, at its widest internal gap."""
    if len(group) < 2:
        return [group]
    union = group[0][1]
    for item in group[1:]:
        union = union | item[1]
    if union.height <= 26.0:
        return [group]
    ordered = sorted(group, key=lambda item: (item[1].y0 + item[1].y1) / 2)
    gaps = []
    for i in range(len(ordered) - 1):
        a = (ordered[i][1].y0 + ordered[i][1].y1) / 2
        b = (ordered[i + 1][1].y0 + ordered[i + 1][1].y1) / 2
        gaps.append((b - a, i))
    gap, at = max(gaps)
    if gap < 4.5:
        return [group]
    return _split_tall_row(ordered[: at + 1]) + _split_tall_row(ordered[at + 1 :])


def _comp_if_symbol(group, drawings, M, counter_cls) -> Optional[E.Comp]:
    ids = [item[0] for item in group]
    union = group[0][1]
    for item in group[1:]:
        union = union | item[1]
    if union.height > 26.0 or union.width > 46.0:
        return None
    ext = max(union.width, union.height)
    if ext < 5.0 or ext > 40.0:
        return None
    if union.width > 26.0 and union.height < 4.5:
        return None
    if len(ids) < 2 and ext < 6.0:
        return None
    return E.Comp(ids, drawings, M, counter_cls((0.0, 0.0, 0.0) for _ in ids))


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