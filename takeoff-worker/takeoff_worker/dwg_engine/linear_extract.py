"""Linear entities on tray/conduit layers."""
from __future__ import annotations

import math

from .doc_context import DocContext
from .viewport import ViewportRegion, model_to_preview


def extract_linear(
    ctx: DocContext,
    reg: ViewportRegion,
    *,
    sheet_key: str,
    file_id: str,
    width_px: int,
    height_px: int,
    scale_verified: bool,
    meters_per_preview_px: float | None,
    start_id: int,
) -> list[dict]:
    out: list[dict] = []
    seq = start_id
    for e in ctx.doc.modelspace():
        layer = e.dxf.layer
        if not ctx.rules.is_linear_layer(layer):
            continue
        if not ctx.layer_visible(layer, reg.frozen_layers):
            continue
        t = e.dxftype()
        pts_model: list[tuple[float, float]] = []
        try:
            if t == "LINE":
                pts_model = [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]
            elif t == "LWPOLYLINE":
                pts_model = [(p[0], p[1]) for p in e.get_points("xy")]
            elif t == "POLYLINE":
                pts_model = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
        except Exception:
            continue
        if len(pts_model) < 2:
            continue
        if not any(reg.contains(x, y) for x, y in pts_model):
            continue
        pts_px = [model_to_preview(x, y, reg, width_px, height_px) for x, y in pts_model]
        length_px = sum(
            math.hypot(pts_px[i + 1][0] - pts_px[i][0], pts_px[i + 1][1] - pts_px[i][1])
            for i in range(len(pts_px) - 1)
        )
        length_m = length_px * meters_per_preview_px if scale_verified and meters_per_preview_px else None
        out.append(
            dict(
                id=f"{sheet_key}#L{seq}",
                sheetKey=sheet_key,
                fileId=file_id,
                layer=layer,
                typeKey=None,
                points=pts_px,
                lengthMeters=length_m,
                lengthPreviewPx=length_px,
                scaleVerified=scale_verified,
            )
        )
        seq += 1
    return out