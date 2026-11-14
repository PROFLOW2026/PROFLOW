"""Monochrome / B&W symbol candidate extractor (best-effort)."""
from __future__ import annotations

from .geometry import PdfMatrix, PdfRect
from . import shape_engine as E


def black_symbol_candidates(
    drawings: list[dict],
    M: PdfMatrix,
    plan_rect: PdfRect,
    min_ext: float = 4.0,
    max_ext: float = 35.0,
    max_stroke_len: float = 80.0,
) -> list[E.Comp]:
    """Black paths only; drop long wall/dimension strokes."""
    ids = []
    rects = []
    for i, x in enumerate(drawings):
        c = E.item_color(x)
        if not E.is_dark(c):
            continue
        r = E.drect(x, M)
        if not plan_rect.intersects(r):
            continue
        if max(r.width, r.height) > max_stroke_len and min(r.width, r.height) < 1.0:
            continue
        ids.append(i)
        rects.append(r)
    if not ids:
        return []
    groups = E.cluster(rects, tol=0.8)
    comps: list[E.Comp] = []
    for g in groups:
        gi = [ids[k] for k in g]
        rr = None
        for k in g:
            rr = rects[k] if rr is None else (rr | rects[k])
        assert rr is not None
        ext = max(rr.width, rr.height)
        ar = rr.width / max(rr.height, 0.01)
        if ext < min_ext or ext > max_ext:
            continue
        if ar > 8 and ext > 20:
            continue
        from collections import Counter

        cols = Counter((0.0, 0.0, 0.0) for _ in gi)
        comps.append(E.Comp(gi, drawings, M, cols))
    return comps