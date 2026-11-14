"""LegendTemplate helpers."""
from __future__ import annotations

import base64

from takeoff_worker.engine_api import LegendTemplate

from .masks import dominant_hex, mask_signature, mask_to_b64
from . import shape_engine as E


def legend_template_from_comp(key: str, comp: E.Comp, file_id: str, tag: str | None = None, decoded: str | None = None) -> LegendTemplate:
    return LegendTemplate(
        key=key,
        source_file_id=file_id,
        mask_b64=mask_to_b64(comp.mask),
        color_hex=dominant_hex(dict(comp.colors)),
        radius_pt=float(comp.rad),
        tag_text=tag,
        decoded_text=decoded,
    )


def comp_from_legend_template(t: LegendTemplate) -> E.Comp:
    import numpy as np
    from collections import Counter

    from .geometry import PdfRect

    raw = base64.b64decode(t.mask_b64)
    bits = np.unpackbits(np.frombuffer(raw, np.uint8))[:4096].reshape((64, 64))
    mask = bits.astype(np.uint8) * 255
    c = E.Comp.__new__(E.Comp)
    c.ids = []
    c.n = 1
    c.rect = PdfRect(0, 0, (t.radius_pt or 14) * 2, (t.radius_pt or 14) * 2)
    c.colors = Counter()
    c.polys = []
    c.mask = mask
    c.center = (32.0, 32.0)
    c.rad = t.radius_pt or 14.0
    c.ys, c.xs = E.pts_of(mask)
    c.dt = E.dt_of(mask)
    c.diag_pt = c.rad * 2
    return c