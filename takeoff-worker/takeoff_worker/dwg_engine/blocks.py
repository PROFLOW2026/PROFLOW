"""Block name resolution: dynamic, nested wrappers, xref flags."""
from __future__ import annotations

from collections import Counter

from .geometry import block_polys, geometry_hash

XREF_BLOCK_FLAG = 4


def is_xref_block(doc, name: str) -> bool:
    b = doc.blocks.get(name)
    if b is None:
        return False
    try:
        return bool(b.block.dxf.flags & XREF_BLOCK_FLAG)
    except Exception:
        return False


def dynamic_true_name(doc, name: str) -> tuple[str, str]:
    if not name.startswith("*"):
        return name, "plain"
    b = doc.blocks.get(name)
    if b is None:
        return name, "unresolved"
    try:
        xd = b.block_record.xdata
        if xd is not None and "AcDbDynamicBlockTrueName" in xd.data:
            for code, val in xd.get("AcDbDynamicBlockTrueName"):
                if code == 1000:
                    return str(val), "dynamic-true-name"
    except Exception:
        pass
    leaf, kind = wrapper_leaf(doc, name)
    if kind == "wrapper":
        return leaf, "wrapper"
    if polys := block_polys(b):
        return geometry_hash(polys), "dynamic_block_unresolved"
    return name, "dynamic_block_unresolved"


def wrapper_leaf(doc, name: str) -> tuple[str, str]:
    """If block is a single-insert wrapper, return inner block name."""
    b = doc.blocks.get(name)
    if b is None:
        return name, "plain"
    inners = [x.dxf.name for x in b if x.dxftype() == "INSERT"]
    if not inners:
        return name, "plain"
    counts = Counter(inners)
    if len(counts) == 1:
        inner = next(iter(counts))
        if not inner.startswith("*") or doc.blocks.get(inner):
            if not inner.startswith("*"):
                return inner, "wrapper"
            tn, how = dynamic_true_name(doc, inner)
            if how != "dynamic_block_unresolved":
                return tn, "wrapper"
    return name, "plain"


def resolve_block_name(doc, insert_name: str) -> tuple[str, str, list[str]]:
    """Resolved display name, resolution kind, review reasons."""
    reasons: list[str] = []
    if is_xref_block(doc, insert_name):
        return insert_name, "xref", reasons
    tn, how = dynamic_true_name(doc, insert_name)
    if how == "wrapper":
        return tn, how, reasons
    if how == "dynamic_block_unresolved":
        reasons.append("dynamic_block_unresolved")
        return tn if tn.startswith("block:*geom:") else insert_name, how, reasons
    if how == "dynamic-true-name":
        return tn, how, reasons
    if insert_name.startswith("*"):
        leaf, kind = wrapper_leaf(doc, insert_name)
        if kind == "wrapper":
            return leaf, kind, reasons
        b = doc.blocks.get(insert_name)
        if b is not None:
            gh = geometry_hash(block_polys(b))
            reasons.append("dynamic_block_unresolved")
            return gh, "anonymous", reasons
    return insert_name, "plain", reasons


def inner_symbol_leaves(doc, block_name: str, rules) -> list[str]:
    """Distinct symbol inner blocks for real groups (multi-insert definitions)."""
    b = doc.blocks.get(block_name)
    if b is None:
        return []
    names = {x.dxf.name for x in b if x.dxftype() == "INSERT"}
    if len(names) <= 1:
        return []
    out: list[str] = []
    for n in names:
        rn, _, _ = resolve_block_name(doc, n)
        if rn.startswith("*") or is_xref_block(doc, n):
            continue
        out.append(rn)
    return out