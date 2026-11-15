"""Legend layout detection and block ↔ text pairing."""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from .blocks import is_xref_block
from .detections import collect_sheet_inserts, signature_and_class
from .doc_context import DocContext
from .hebrew import HEBREW_RE, decode_dwg_text
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
        def _side(predicate) -> list[tuple[int, float, str, str, str]]:
            found = []
            for ti, (ty, tx, raw, font, big) in enumerate(texts):
                if ti in used:
                    continue
                if abs(ty - cy) <= y_tol and predicate(tx):
                    found.append((ti, tx, raw, font, big))
            return found

        right = _side(lambda tx: tx > cx + x_gap)
        left = _side(lambda tx: tx < cx - x_gap)
        line_texts = _prefer_legend_side(right, left)
        for ti, _tx, _raw, _font, _big in line_texts:
            used.add(ti)
        line_texts = [(t[1], t[2], t[3], t[4]) for t in line_texts]
        line_texts.sort(key=lambda t: t[0])
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
                resolved=resolved,
                x=cx,
                y=cy,
            )
        )
    return rows


def _hebrew_count(text: str) -> int:
    return len(HEBREW_RE.findall(text or ""))


def _prefer_legend_side(
    right: list[tuple[int, float, str, str, str]],
    left: list[tuple[int, float, str, str, str]],
) -> list[tuple[int, float, str, str, str]]:
    """Hebrew legends put the description to the left of the symbol; LTR sheets use the right."""

    def score(group: list[tuple[int, float, str, str, str]]) -> tuple[int, int]:
        if not group:
            return (-1, 0)
        raw = " ".join(t[2] for t in group)
        font = group[0][3]
        big = group[0][4]
        dec, _how = decode_dwg_text(raw, font_name=font, bigfont=big)
        return (_hebrew_count(dec), len(raw))

    if score(left) > score(right):
        return left
    return right


def _median(vals: list[float], default: float) -> float:
    if not vals:
        return default
    ordered = sorted(vals)
    return ordered[len(ordered) // 2]


def collect_drawing_legend_rows(ctx: DocContext) -> list[dict]:
    """Legend rows: a vertical column of distinct blocks, each with adjacent text.

    Block names are not types. Rows only carry the text that sits beside the symbol
    so a later catalog match can assign a typeKey. Plan grids of one repeated block
    are not columns.
    """
    rows = _legend_columns_in_model(ctx)
    named = _named_layout_legend_rows(ctx)
    return _dedupe_legend_rows(rows + named)


def _named_layout_legend_rows(ctx: DocContext) -> list[dict]:
    out: list[dict] = []
    for lay in ctx.doc.layouts:
        if lay.name == "Model" or not LEGEND_NAME_RX.search(lay.name):
            continue
        reg = legend_viewport_region(ctx, lay.name)
        if reg is None:
            continue
        out.extend(pair_legend_rows(ctx, reg))
    return out


def _dedupe_legend_rows(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for i, row in enumerate(rows):
        key = (
            str(row.get("signature") or ""),
            round(float(row.get("x") or 0.0), 1),
            round(float(row.get("y") or 0.0), 1),
        )
        if key in seen:
            continue
        seen.add(key)
        row = dict(row)
        row["rowIndex"] = i
        out.append(row)
    return out


def _legend_columns_in_model(ctx: DocContext) -> list[dict]:
    inserts = _legend_candidate_inserts(ctx)
    texts = _model_texts(ctx)
    if len(inserts) < 3 or not texts:
        return []
    heights = [t["height"] for t in texts if t["height"] > 0]
    med_h = _median(heights, 10.0)
    x_tol = max(med_h * 3.0, 12.0)
    columns = _cluster_by_x(inserts, x_tol)
    # A legend is one tight stack. Split building-high columns on large Y gaps, and
    # reject a stack whose symbols drift apart in X (a diagonal of unrelated blocks).
    x_span_max = max(med_h * 2.2, 8.0)
    y_gap = max(med_h * 20.0, 80.0)
    rows: list[dict] = []
    for col in columns:
        for run in _split_y_runs(col, y_gap):
            rows.extend(
                _rows_from_legend_run(
                    run,
                    texts,
                    med_h=med_h,
                    x_span_max=x_span_max,
                    x_reach=x_tol,
                    start_index=len(rows),
                )
            )
    return rows


def _rows_from_legend_run(
    col: list[dict],
    texts: list[dict],
    *,
    med_h: float,
    x_span_max: float,
    x_reach: float,
    start_index: int,
) -> list[dict]:
    if len(col) < 3:
        return []
    names = [c["resolved"].lower() for c in col]
    if len(set(names)) / len(col) < 0.6:
        return []
    ys = sorted(c["y"] for c in col)
    xs = [c["x"] for c in col]
    y_span = ys[-1] - ys[0]
    x_span = max(xs) - min(xs)
    if x_span > x_span_max:
        return []
    if y_span < max(med_h * 2, 1.0) or y_span < x_span:
        return []
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 0.5]
    pitch = _median(gaps, med_h * 2)
    y_tol = max(med_h * 0.8, min(pitch * 0.45, med_h * 2.2))
    x_max = max(x_reach * 8.0, med_h * 18.0)
    x_min = max(med_h * 0.4, 2.0)
    attached_by_id = _assign_texts(col, texts, y_tol=y_tol, x_min=x_min, x_max=x_max)
    built: list[dict] = []
    for ins in col:
        attached = attached_by_id.get(id(ins), [])
        if not attached:
            continue
        row = _row_from_insert(ins, attached, row_index=start_index + len(built))
        if _hebrew_count(str(row.get("decodedText") or "")) < 3:
            continue
        built.append(row)
    if len(built) < 3 or len(built) / len(col) < 0.5:
        return []
    return built


def _split_y_runs(col: list[dict], gap: float) -> list[list[dict]]:
    ordered = sorted(col, key=lambda p: p["y"])
    runs: list[list[dict]] = []
    for ins in ordered:
        if not runs or ins["y"] - runs[-1][-1]["y"] > gap:
            runs.append([ins])
        else:
            runs[-1].append(ins)
    return runs


def _legend_candidate_inserts(ctx: DocContext) -> list[dict]:
    out: list[dict] = []
    for e in ctx.inserts:
        name = str(e.dxf.name or "")
        if not name or name.startswith("*") or name.startswith("$"):
            continue
        if ctx.rules.is_excluded_block(name) or is_xref_block(ctx.doc, name):
            continue
        resolved, _, _ = ctx.resolved_name(name)
        if not resolved or resolved.startswith("*"):
            continue
        cx, cy = ctx.insert_center(e)
        out.append(
            dict(x=cx, y=cy, resolved=resolved, block_name=name, layer=str(e.dxf.layer or ""))
        )
    return out


def _model_texts(ctx: DocContext) -> list[dict]:
    out: list[dict] = []
    for e in ctx.doc.modelspace():
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        raw = e.dxf.text if e.dxftype() == "TEXT" else e.text
        raw = str(raw or "").strip()
        if not raw:
            continue
        style_name = str(e.dxf.style or "")
        st = ctx.doc.styles.get(style_name) if style_name in ctx.doc.styles else None
        font = str(st.dxf.font) if st else ""
        big = str(st.dxf.get("bigfont", "") or "") if st else ""
        if e.dxftype() == "TEXT":
            height = float(e.dxf.get("height", 0) or 0)
        else:
            height = float(e.dxf.get("char_height", 0) or 0)
        out.append(
            dict(
                x=float(e.dxf.insert.x),
                y=float(e.dxf.insert.y),
                raw=raw,
                font=font,
                big=big,
                height=height,
            )
        )
    return out


def _cluster_by_x(inserts: list[dict], tol: float) -> list[list[dict]]:
    ordered = sorted(inserts, key=lambda p: (p["x"], p["y"]))
    clusters: list[list[dict]] = []
    for ins in ordered:
        if not clusters or ins["x"] - clusters[-1][-1]["x"] > tol:
            clusters.append([ins])
        else:
            clusters[-1].append(ins)
    return clusters


def _assign_texts(
    col: list[dict],
    texts: list[dict],
    *,
    y_tol: float,
    x_min: float,
    x_max: float,
) -> dict[int, list[dict]]:
    """Each text is given to the nearest symbol in the column, then kept on that side only."""
    buckets: dict[int, list[dict]] = {id(ins): [] for ins in col}
    for text in texts:
        best = None
        best_d = 1e18
        for ins in col:
            dy = abs(text["y"] - ins["y"])
            dx = abs(text["x"] - ins["x"])
            if dy > y_tol or dx < x_min or dx > x_max:
                continue
            dist = dy * 4.0 + dx
            if dist < best_d:
                best, best_d = ins, dist
        if best is not None:
            buckets[id(best)].append(text)
    out: dict[int, list[dict]] = {}
    for ins in col:
        picked = buckets[id(ins)]
        if not picked:
            continue
        picked.sort(key=lambda t: (abs(t["y"] - ins["y"]), abs(t["x"] - ins["x"])))
        nearest = picked[0]
        side = 1 if nearest["x"] >= ins["x"] else -1
        row = [t for t in picked if (1 if t["x"] >= ins["x"] else -1) == side]
        row.sort(key=lambda t: t["x"])
        out[id(ins)] = row[:6]
    return out


def _row_from_insert(ins: dict, texts: list[dict], *, row_index: int) -> dict:
    raws = [t["raw"] for t in texts]
    decoded_parts: list[str] = []
    decoded_by = None
    for t in texts:
        dec, how = decode_dwg_text(t["raw"], font_name=t["font"], bigfont=t["big"])
        if how == "dwg_kbd":
            decoded_by = "dwg_kbd"
        decoded_parts.append(dec)
    merged_raw = " ".join(raws).strip()
    merged_dec = " ".join(p for p in decoded_parts if p).strip()
    sig, _ = signature_and_class(ins["resolved"])
    return dict(
        key=sig.replace("block:", "", 1) if sig.startswith("block:") else sig,
        signature=sig,
        rawText=merged_raw or None,
        decodedText=merged_dec or None,
        decodedBy=decoded_by or ("none" if not merged_raw else None),
        rowIndex=row_index,
        blockName=ins["block_name"],
        resolved=ins["resolved"],
        x=ins["x"],
        y=ins["y"],
        layer=ins["layer"],
    )


def count_blocks_all_sheets(counts: Counter) -> Counter:
    return counts