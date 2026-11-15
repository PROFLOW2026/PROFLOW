"""INSERT → WorkerDetection rows with de-dup and MINSERT expansion."""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from ezdxf.entities import Insert

from .blocks import is_xref_block
from .doc_context import DocContext
from .viewport import ViewportRegion, model_to_preview

_CONF_ORDER = ("high", "medium", "low", "none")


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
    legend_names: set[str] | None = None,
) -> tuple[list[RawInsert], int, int]:
    xref_missing = xref_missing or set()
    layout_name = layout_name or reg.layout_name
    legend_names = {n.lower() for n in (legend_names or set()) if n}
    visible: list[RawInsert] = []
    hidden = 0
    for ins in ctx.inserts:
        if not _insert_is_device_candidate(ctx, ins, layout_name, legend_names):
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


def _insert_is_device_candidate(ctx: DocContext, ins: Insert, layout_name: str, legend_names: set[str]) -> bool:
    """Symbol-layer inserts, plus blocks a legend row on this drawing actually names.

    A block name by itself is not enough — ``legend_names`` is filled only from legend rows.
    """
    if ctx.is_symbol_insert(ins, layout_name=layout_name):
        return True
    if ctx.rules.is_excluded_block(ins.dxf.name):
        return False
    if ins.dxf.name.startswith("*") or is_xref_block(ctx.doc, ins.dxf.name):
        return False
    resolved, _, _ = ctx.resolved_name(ins.dxf.name)
    if resolved.startswith("*"):
        return False
    return resolved.lower() in legend_names or ins.dxf.name.lower() in legend_names


def _worse_confidence(a: str, b: str) -> str:
    return _CONF_ORDER[max(_CONF_ORDER.index(a), _CONF_ORDER.index(b))]


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


def _lookup_type(table: dict, signature: str) -> object | None:
    if signature in table:
        return table[signature]
    low = signature.lower()
    if low in table:
        return table[low]
    return None


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
    legend_types: dict[str, tuple[str, str]] | None = None,
) -> dict:
    """typeKey comes from a library signature or from a legend row on this drawing.

    Block names such as sw1 / l60 / parabolic never become a type on their own.
    Confidence stays ``none`` when typeKey is null, except geometry that is only a
    candidate (exploded / unresolved dynamic / missing xref) which stays low and untyped.
    """
    signature, raw_class = signature_and_class(raw.resolved)
    px, py = model_to_preview(raw.x, raw.y, reg, width_px, height_px)
    legend_types = legend_types or {}
    scrap = "possible_exploded_symbol" in raw.reasons
    type_key = None
    classified = "none"
    conf = "none"
    if not scrap:
        type_key = _lookup_type(library_map, signature)
        if type_key:
            classified = "library"
            conf = "high" if not raw.reasons else "low"
        else:
            hit = _lookup_type(legend_types, signature)
            if hit:
                type_key, leg_conf = hit
                classified = "legend_text"
                conf = leg_conf or "low"
                if raw.reasons:
                    conf = _worse_confidence(conf, "low")
    if not type_key:
        classified = "none"
        conf = "none"
    if scrap or "dynamic_block_unresolved" in raw.reasons or "xref_missing" in raw.reasons:
        if not type_key:
            conf = "low"
        else:
            conf = _worse_confidence(conf, "low")
    reasons = list(dict.fromkeys(raw.reasons))
    if type_key and conf == "low" and "low_confidence" not in reasons:
        reasons.append("low_confidence")
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
        reasons=reasons,
        native=dict(x=raw.x, y=raw.y),
    )