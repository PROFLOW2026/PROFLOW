"""Merge xref file inserts into host coordinates."""
from __future__ import annotations

import math

from ezdxf.entities import Insert

from .blocks import is_xref_block
from .detections import RawInsert, nearest_tag
from .doc_context import DocContext


def _xf_point(
    x: float,
    y: float,
    tx: float,
    ty: float,
    rot_deg: float,
    sx: float,
    sy: float,
) -> tuple[float, float]:
    th = math.radians(rot_deg)
    return (
        tx + x * sx * math.cos(th) - y * sy * math.sin(th),
        ty + x * sx * math.sin(th) + y * sy * math.cos(th),
    )


def _host_xref_instances(host: DocContext) -> list[Insert]:
    return [ins for ins in host.inserts if is_xref_block(host.doc, ins.dxf.name)]


def xref_binding_key(parent_id: str, block_name: str, saved_path: str) -> tuple[str, str, str]:
    """(parent logical id, block name, saved path). The block name alone is not a key."""
    return (parent_id, block_name, saved_path)


def collect_merged_xref_inserts(
    host: DocContext,
    xref_ctxs: dict[str, DocContext],
    reg,
    *,
    layout_name: str,
    bindings: dict[tuple[str, str, str], DocContext] | None = None,
    host_id: str = "",
) -> list[RawInsert]:
    """For each loaded xref, expand xref modelspace symbols under host xref INSERT transforms."""
    out: list[RawInsert] = []
    path_of = {str(xr.get("name") or ""): str(xr.get("path") or "") for xr in host.xrefs}
    for host_ins in _host_xref_instances(host):
        name = host_ins.dxf.name
        if bindings is not None:
            xctx = bindings.get(xref_binding_key(host_id, name, path_of.get(name, "")))
        else:
            xctx = xref_ctxs.get(name)
        if xctx is None:
            continue
        tx, ty = host_ins.dxf.insert.x, host_ins.dxf.insert.y
        rot = float(host_ins.dxf.get("rotation", 0.0) or 0.0)
        sx = float(host_ins.dxf.get("xscale", 1.0) or 1.0)
        sy = float(host_ins.dxf.get("yscale", 1.0) or 1.0)
        for xins in xctx.inserts:
            if not xctx.is_symbol_insert(xins, layout_name=layout_name):
                continue
            cx, cy = xctx.insert_center(xins)
            hx, hy = _xf_point(cx, cy, tx, ty, rot, sx, sy)
            if not reg.contains(hx, hy):
                continue
            layer = xins.dxf.layer
            if "|" not in layer:
                layer = f"{name}|{layer}"
            resolved, _, reasons = host.resolved_name(xins.dxf.name)
            if resolved.startswith("*") and not resolved.startswith("block:*geom:"):
                continue
            out.append(
                RawInsert(
                    resolved=resolved,
                    layer=layer,
                    x=hx,
                    y=hy,
                    rot=rot + float(xins.dxf.get("rotation", 0.0) or 0.0),
                    block_name=xins.dxf.name,
                    reasons=list(reasons),
                    tag=nearest_tag(host, hx, hy),
                )
            )
    return out


def sheet_has_missing_xref_content(
    host: DocContext,
    reg,
    missing: set[str],
    layout_name: str,
) -> bool:
    if not missing:
        return False
    for ins in host.inserts:
        if not host.is_symbol_insert(ins, layout_name=layout_name):
            continue
        layer = ins.dxf.layer
        if "|" in layer and layer.split("|", 1)[0] in missing:
            cx, cy = host.insert_center(ins)
            if reg.contains(cx, cy):
                return True
    return False