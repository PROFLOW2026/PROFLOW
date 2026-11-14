"""Planner library template matching."""
from __future__ import annotations

import base64
from typing import Optional

import numpy as np

from takeoff_worker.models import SymbolLibraryEntry

from . import shape_engine as E
from .masks import dominant_hex


def _mask_from_b64(mask_b64: str, size: int = 64) -> np.ndarray:
    raw = base64.b64decode(mask_b64)
    bits = np.unpackbits(np.frombuffer(raw, np.uint8))
    bits = bits[: size * size]
    return bits.reshape((size, size)).astype(np.uint8) * 255


def comp_from_library(entry: SymbolLibraryEntry) -> Optional[E.Comp]:
    if not entry.template or not entry.template.maskB64:
        return None
    mask = _mask_from_b64(entry.template.maskB64)
    from collections import Counter

    c = E.Comp.__new__(E.Comp)
    c.ids = []
    c.n = 1
    from .geometry import PdfRect

    c.rect = PdfRect(0, 0, 32, 32)
    if entry.template.colorHex:
        # parse hex
        h = entry.template.colorHex.lstrip("#")
        rgb = tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
        c.colors = Counter({tuple(round(v, 2) for v in rgb): 1})
    else:
        c.colors = Counter()
    c.polys = []
    c.mask = mask
    c.center = (32, 32)
    c.rad = 14.0
    c.ys, c.xs = E.pts_of(mask)
    c.dt = E.dt_of(mask)
    c.diag_pt = 32.0
    return c


def library_templates(library: list[SymbolLibraryEntry]) -> list[tuple[str, E.Comp, SymbolLibraryEntry]]:
    out = []
    for e in library:
        if e.signatureKind != "pdf-shape":
            continue
        c = comp_from_library(e)
        if c is not None:
            out.append((e.typeKey, c, e))
    return out