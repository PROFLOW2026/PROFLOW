"""Legend layout detection and block ↔ text pairing."""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from .detections import collect_sheet_inserts, signature_and_class
from .doc_context import DocContext
from .hebrew import decode_dwg_text
from .viewport import ViewportRegion, pick_sheet_viewport, regions_for_layout


LEGEND_NAME_RX = re.compile(r"(?i)מקרא|legend|LEG|סימון")


def find_legend_layout(ctx: DocContext) -> str | None:
    by_name = None
    best_dominated = None
    best_score = 0
    for lay in ctx.doc.layouts:
        if lay.name == "Model":
            continue
        if LEGEND_NAME_RX.search(lay.name):
            by_name = lay.name
        regs = regions_for_layout(ctx.doc, lay.name)
        vp = pick_sheet_viewport(regs)
        if vp is None:
            continue
        vis, _, _ = collect_sheet_inserts(ctx, vp)
        if not vis:
            continue
        names = [v.resolved for v in vis]
        c = Counter(names)
        distinct = len(c)
        score = len(vis) / max(distinct, 1)
        if distinct >= 8 and score < 2.5 and score > best_score:
            best_score = score
            best_dominated = lay.name
    return by_name or best_dominated


def legend_viewport_region(ctx: DocContext, layout_name: str) -> ViewportRegion | None:
    regs = regions_for_layout(ctx.doc, layout_name)
    return pick_sheet_viewport(regs, ctx)


def pair_legend_rows(ctx: DocContext, reg: ViewportRegion) -> list[dict]:
    """Rows: block insert + merged text to the right."""
    ins = []
    for e in ctx.inserts:
        if e.dxftype() != "INSERT":
            continue
        if not ctx.is_symbol_insert(e) and not e.dxf.name[0].isalpha():
            continue
        cx, cy = ctx.insert_center(e)
        if not reg.contains(cx, cy):
            continue
        resolved, _, _ = ctx.resolved_name(e.dxf.name)
        if resolved.startswith("*") and not resolved.startswith("block:*geom:"):
            continue
        ins.append((cy, cx, resolved, e.dxf.name))
    ins.sort(key=lambda t: (-t[0], t[1]))

    texts: list[tuple[float, float, str, str, str]] = []
    for e in ctx.doc.modelspace():
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        px = e.dxf.insert.x
        py = e.dxf.insert.y
        if not reg.contains(px, py):
            continue
        raw = e.dxf.text if e.dxftype() == "TEXT" else e.text
        raw = str(raw or "").strip()
        if not raw:
            continue
        st = ctx.doc.styles.get(e.dxf.style) if e.dxf.style in ctx.doc.styles else None
        font = str(st.dxf.font) if st else ""
        big = str(st.dxf.get("bigfont", "") or "") if st else ""
        texts.append((py, px, raw, font, big))

    rows: list[dict] = []
    used: set[int] = set()
    y_tol = max(reg.hh * 0.02, 50.0)
    x_gap = reg.hw * 0.05

    for row_i, (cy, cx, resolved, block_name) in enumerate(ins):
        line_texts: list[tuple[float, str, str, str]] = []
        for ti, (ty, tx, raw, font, big) in enumerate(texts):
            if ti in used:
                continue
            if abs(ty - cy) <= y_tol and tx > cx + x_gap:
                line_texts.append((tx, raw, font, big))
        line_texts.sort(key=lambda t: t[0])
        for ti, (ty, tx, raw, font, big) in enumerate(texts):
            if ti in used:
                continue
            if abs(ty - cy) <= y_tol and tx > cx + x_gap:
                used.add(ti)
        merged_raw = " ".join(t[1] for t in line_texts).strip()
        decoded, dec_by = decode_dwg_text(merged_raw, font_name=line_texts[0][2] if line_texts else "", bigfont=line_texts[0][3] if line_texts else "")
        sig, _ = signature_and_class(resolved)
        rows.append(
            dict(
                key=sig.replace("block:", "", 1) if sig.startswith("block:") else sig,
                signature=sig,
                rawText=merged_raw or None,
                decodedText=decoded if dec_by else (decoded if merged_raw else None),
                decodedBy=dec_by or ("none" if not merged_raw else None),
                rowIndex=row_i,
                blockName=block_name,
            )
        )
    return rows


def count_blocks_all_sheets(counts: Counter) -> Counter:
    return counts