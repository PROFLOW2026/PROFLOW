"""INSERT → WorkerDetection rows with de-dup and MINSERT expansion."""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from ezdxf.entities import Insert

from .doc_context import DocContext
from .viewport import ViewportRegion, model_to_preview


@dataclass
class RawInsert:
    resolved: str
    layer: str
    x: float
    y: float
    rot: float
    block_name: str
    reasons: list[str]
    tag: str | None


def _minsert_bases(ins: Insert) -> list[tuple[float, float]]:
    rc = int(ins.dxf.get("row_count", 1) or 1)
    cc = int(ins.dxf.get("column_count", 1) or 1)
    rs = float(ins.dxf.get("row_spacing", 0) or 0)
    cs = float(ins.dxf.get("column_spacing", 0) or 0)
    if rc == 1 and cc == 1:
        return [(ins.dxf.insert.x, ins.dxf.insert.y)]
    th = math.radians(ins.dxf.get("rotation", 0.0))
    ox, oy = ins.dxf.insert.x, ins.dxf.insert.y
    out: list[tuple[float, float]] = []
    for r in range(rc):
        for c in range(cc):
            lx, ly = c * cs, r * rs
            x = ox + lx * math.cos(th) - ly * math.sin(th)
            y = oy + lx * math.sin(th) + ly * math.cos(th)
            out.append((x, y))
    return out


def _center_at_base(ctx: DocContext, ins: Insert, bx: float, by: float) -> tuple[float, float]:
    cc = ctx.block_center(ins.dxf.name)
    th = math.radians(ins.dxf.get("rotation", 0.0))
    sx = float(ins.dxf.get("xscale", 1.0) or 1.0)
    sy = float(ins.dxf.get("yscale", 1.0) or 1.0)
    dx, dy = ins.dxf.insert.x, ins.dxf.insert.y
    shift_x, shift_y = bx - dx, by - dy
    ccx = bx + (cc[0] * sx) * math.cos(th) - (cc[1] * sy) * math.sin(th)
    ccy = by + (cc[0] * sx) * math.sin(th) + (cc[1] * sy) * math.cos(th)
    return ccx + shift_x * 0, ccy + shift_y * 0


def nearest_tag(ctx: DocContext, x: float, y: float, max_dist: float = 1200.0) -> str | None:
    best = None
    best_d = max_dist
    for e in ctx.doc.modelspace():
        if e.dxftype() not in ("TEXT", "MTEXT", "ATTRIB"):
            continue
        try:
            if e.dxftype() == "ATTRIB":
                t = str(e.dxf.text or "").strip()
                if t:
                    return t
            px = e.dxf.insert.x
            py = e.dxf.insert.y
            d = math.hypot(px - x, py - y)
            if d < best_d:
                s = e.dxf.text if e.dxftype() == "TEXT" else e.text
                s = str(s or "").strip()
                if s and len(s) <= 16:
                    best, best_d = s, d
        except Exception:
            continue
    return best


def collect_sheet_inserts(
    ctx: DocContext,
    reg: ViewportRegion,
    *,
    xref_missing: set[str] | None = None,
    layout_name: str = "",
    extra: list[RawInsert] | None = None,
) -> tuple[list[RawInsert], int, int]:
    xref_missing = xref_missing or set()
    layout_name = layout_name or reg.layout_name
    visible: list[RawInsert] = []
    hidden = 0
    for ins in ctx.inserts:
        if not ctx.is_symbol_insert(ins, layout_name=layout_name):
            continue
        layer = ins.dxf.layer
        if ctx.rules.is_panel_layout(layout_name) and layer != "0":
            continue
        rot = float(ins.dxf.get("rotation", 0.0) or 0.0)
        resolved, _, reasons = ctx.resolved_name(ins.dxf.name)
        if resolved.startswith("*") and not resolved.startswith("block:*geom:"):
            continue
        for bx, by in _minsert_bases(ins):
            cx, cy = _center_at_base(ctx, ins, bx, by)
            if not reg.contains(cx, cy):
                continue
            if not ctx.layer_visible(layer, reg.frozen_layers):
                hidden += 1
                continue
            extra_reasons = list(reasons)
            if _layer_from_missing_xref(layer, xref_missing):
                extra_reasons.append("xref_missing")
            tag = nearest_tag(ctx, cx, cy)
            visible.append(
                RawInsert(
                    resolved=resolved,
                    layer=layer,
                    x=cx,
                    y=cy,
                    rot=rot,
                    block_name=ins.dxf.name,
                    reasons=extra_reasons,
                    tag=tag,
                )
            )
    if extra:
        visible.extend(extra)
    visible, extras = dedupe(visible)
    return visible, hidden, extras


def _layer_from_missing_xref(layer: str, missing: set[str]) -> bool:
    if "|" not in layer:
        return False
    return layer.split("|", 1)[0] in missing


def dedupe(rows: list[RawInsert]) -> tuple[list[RawInsert], int]:
    groups: dict[tuple, list[RawInsert]] = defaultdict(list)
    for r in rows:
        name = r.resolved.split("block:", 1)[-1] if r.resolved.startswith("block:") else r.resolved
        key = (name, r.layer, round(r.x, 1), round(r.y, 1), round(r.rot, 0))
        groups[key].append(r)
    out: list[RawInsert] = []
    extras = 0
    for grp in groups.values():
        one = grp[0]
        if len(grp) > 1:
            if "possible_duplicate" not in one.reasons:
                one.reasons.append("possible_duplicate")
            extras += len(grp) - 1
        out.append(one)
    return out, extras


def signature_and_class(resolved: str) -> tuple[str, str]:
    if resolved.startswith("block:*geom:") or resolved.startswith("block:"):
        if resolved.startswith("block:*geom:"):
            return resolved, resolved.replace("block:", "", 1)
        return resolved, resolved.replace("block:", "", 1)
    return f"block:{resolved}", resolved


def raw_to_worker(
    raw: RawInsert,
    *,
    sheet_key: str,
    file_id: str,
    seq: int,
    reg: ViewportRegion,
    width_px: int,
    height_px: int,
    library_map: dict[str, str],
) -> dict:
    signature, raw_class = signature_and_class(raw.resolved)
    px, py = model_to_preview(raw.x, raw.y, reg, width_px, height_px)
    type_key = library_map.get(signature)
    classified = "library" if type_key else "none"
    if type_key and not raw.reasons:
        conf = "high"
    elif type_key:
        conf = "low"
    elif raw.reasons:
        conf = "low"
    else:
        conf = "none"
    if "possible_exploded_symbol" in raw.reasons:
        conf = "low"
    elif "dynamic_block_unresolved" in raw.reasons or "xref_missing" in raw.reasons:
        conf = "low"
    return dict(
        id=f"{sheet_key}#{seq}",
        sheetKey=sheet_key,
        fileId=file_id,
        source="dwg",
        x=px,
        y=py,
        w=12.0,
        h=12.0,
        angleDeg=raw.rot,
        signature=signature,
        signatureKind="dwg-block",
        rawClass=raw_class,
        blockName=raw.block_name,
        layer=raw.layer,
        tagText=raw.tag,
        typeKey=type_key,
        classifiedBy=classified,
        confidence=conf,
        reasons=list(dict.fromkeys(raw.reasons)),
        native=dict(x=raw.x, y=raw.y),
    )