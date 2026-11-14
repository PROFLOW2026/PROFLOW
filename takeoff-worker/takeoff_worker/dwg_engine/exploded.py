"""Loose geometry clusters matching block templates (low confidence)."""
from __future__ import annotations

from collections import defaultdict

import ezdxf.bbox

from .doc_context import DocContext
from .detections import RawInsert, signature_and_class
from .geometry import block_polys, normalize_segments, segments_match


def find_exploded_symbols(
    ctx: DocContext,
    reg,
    *,
    layout_name: str = "",
    match_threshold: float = 0.82,
    max_cluster_entities: int = 40,
) -> list[RawInsert]:
    """Group small loose geometry on symbol layers; match block definitions."""
    layout_name = layout_name or getattr(reg, "layout_name", "")
    symbol_layers = {
        ins.dxf.layer for ins in ctx.inserts if ctx.is_symbol_insert(ins, layout_name=layout_name)
    }
    templates: dict[str, list] = {}
    for b in ctx.doc.blocks:
        name = b.name
        if name.startswith("*") or name.startswith("$"):
            continue
        if ctx.rules.is_excluded_block(name):
            continue
        segs = normalize_segments(block_polys(b))
        if segs:
            templates[name] = segs

    by_layer_cell: dict[tuple[str, int, int], list] = defaultdict(list)
    cell = max(reg.hw, reg.hh) / 40
    for e in ctx.doc.modelspace():
        if e.dxftype() not in ("LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "HATCH"):
            continue
        layer = e.dxf.layer
        if layer not in symbol_layers:
            continue
        if not ctx.layer_visible(layer, reg.frozen_layers):
            continue
        try:
            bb = ezdxf.bbox.extents([e])
            if not bb.has_data:
                continue
            cx = (bb.extmin.x + bb.extmax.x) / 2
            cy = (bb.extmin.y + bb.extmax.y) / 2
            if not reg.contains(cx, cy):
                continue
            if max(bb.extmax.x - bb.extmin.x, bb.extmax.y - bb.extmin.y) > cell * 3:
                continue
            key = (layer, int((cx - reg.cx) // cell), int((cy - reg.cy) // cell))
            by_layer_cell[key].append(e)
        except Exception:
            continue

    found: list[RawInsert] = []
    for (layer, _, _), ents in by_layer_cell.items():
        if len(ents) > max_cluster_entities or len(ents) < 2:
            continue
        try:
            bb = ezdxf.bbox.extents(ents)
        except Exception:
            continue
        if not bb.has_data:
            continue
        cx = (bb.extmin.x + bb.extmax.x) / 2
        cy = (bb.extmin.y + bb.extmax.y) / 2
        # Build ad-hoc poly fingerprint from segment endpoints (approximation)
        segs = []
        for e in ents:
            t = e.dxftype()
            if t == "LINE":
                segs.extend(
                    normalize_segments(
                        [([(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)], False, False)]
                    )
                )
        if not segs:
            continue
        best_name, best_score = None, 0.0
        for name, tpl in templates.items():
            sc = segments_match(segs, tpl)
            if sc > best_score:
                best_name, best_score = name, sc
        if best_name and best_score >= match_threshold:
            resolved = best_name
            sig, _ = signature_and_class(resolved)
            found.append(
                RawInsert(
                    resolved=resolved,
                    layer=layer,
                    x=cx,
                    y=cy,
                    rot=0.0,
                    block_name=best_name,
                    reasons=["possible_exploded_symbol"],
                    tag=None,
                )
            )
    return found