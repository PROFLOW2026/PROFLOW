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
    """Supported legend structures only: a vertical column, a horizontal row, or a simple table.

    Each accepted row has a description beside one symbol. Block names are not types.
    Text-only tables, images, and irregular pairs are not rows.
    """
    rows = _legend_structures(ctx, _legend_candidate_inserts(ctx), _model_texts(ctx))
    for lay in ctx.doc.layouts:
        if lay.name == "Model":
            continue
        rows.extend(_legend_structures(ctx, _layout_inserts(ctx, lay), _layout_texts(ctx, lay)))
    named = _named_layout_legend_rows(ctx)
    return _dedupe_legend_rows(rows + named)


def count_anchor_rows(ctx: DocContext) -> list[dict]:
    """Rows that already decided which symbols stay out of the quantity.

    Wider legend structures classify types. They do not add or remove symbols.
    """
    return _tight_model_columns(ctx) + _named_layout_legend_rows(ctx)


def count_anchor_points(ctx: DocContext) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for row in count_anchor_rows(ctx):
        if row.get("x") is None or row.get("y") is None:
            continue
        points.append((float(row["x"]), float(row["y"])))
    return points


def _tight_model_columns(ctx: DocContext) -> list[dict]:
    inserts = _legend_candidate_inserts(ctx)
    texts = _model_texts(ctx)
    if len(inserts) < 3 or not texts:
        return []
    heights = [t["height"] for t in texts if t["height"] > 0]
    med_h = _median(heights, 10.0)
    x_tol = max(med_h * 3.0, 12.0)
    x_span_max = max(med_h * 2.2, 8.0)
    y_gap = max(med_h * 20.0, 80.0)
    rows: list[dict] = []
    for col in _cluster_by_x(inserts, x_tol):
        for run in _split_y_runs(col, y_gap):
            rows.extend(_tight_rows(run, texts, med_h=med_h, x_span_max=x_span_max, x_reach=x_tol, start_index=len(rows)))
    return rows


def _tight_rows(
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
    if x_span > x_span_max or y_span < max(med_h * 2, 1.0) or y_span < x_span:
        return []
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 0.5]
    pitch = _median(gaps, med_h * 2)
    y_tol = max(med_h * 0.8, min(pitch * 0.45, med_h * 2.2))
    attached = _assign_texts(col, texts, y_tol=y_tol, x_min=max(med_h * 0.4, 2.0), x_max=max(x_reach * 8.0, med_h * 18.0))
    built: list[dict] = []
    for ins in col:
        picked = attached.get(id(ins), [])
        if not picked:
            continue
        row = _row_from_insert(ins, picked, row_index=start_index + len(built))
        if _hebrew_count(str(row.get("decodedText") or "")) < 3:
            continue
        built.append(row)
    if len(built) < 3 or len(built) / len(col) < 0.5:
        return []
    return built


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


def _legend_structures(ctx: DocContext, inserts: list[dict], texts: list[dict]) -> list[dict]:
    if len(inserts) < 3 or not texts:
        return []
    heights = [t["height"] for t in texts if t["height"] > 0]
    med_h = _median(heights, 10.0)
    axis_tol = max(med_h * 3.0, 12.0)
    gap = max(med_h * 20.0, 80.0)
    reach = max(axis_tol * 8.0, med_h * 18.0)
    rows: list[dict] = []
    for col in _cluster_by_x(inserts, axis_tol):
        for run in _split_runs(col, gap, "y"):
            rows.extend(
                _rows_from_legend_run(
                    run,
                    texts,
                    med_h=med_h,
                    span_max=reach,
                    reach=reach,
                    along="y",
                    start_index=len(rows),
                )
            )
    for row in _cluster_by_y(inserts, axis_tol):
        for run in _split_runs(row, gap, "x"):
            rows.extend(
                _rows_from_legend_run(
                    run,
                    texts,
                    med_h=med_h,
                    span_max=reach,
                    reach=reach,
                    along="x",
                    start_index=len(rows),
                )
            )
    rows.extend(_rows_from_table(inserts, texts, med_h=med_h, reach=reach, start_index=len(rows)))
    return rows


def _rows_from_legend_run(
    col: list[dict],
    texts: list[dict],
    *,
    med_h: float,
    span_max: float,
    reach: float,
    along: str,
    start_index: int,
    shape: str = "stack",
) -> list[dict]:
    if len(col) < 3:
        return []
    names = [c["resolved"].lower() for c in col]
    if len(set(names)) / len(col) < 0.6:
        return []
    xs = [c["x"] for c in col]
    ys = [c["y"] for c in col]
    x_span = max(xs) - min(xs)
    y_span = max(ys) - min(ys)
    long_span = y_span if along == "y" else x_span
    cross_span = x_span if along == "y" else y_span
    if cross_span > span_max:
        return []
    if shape != "table" and (long_span < max(med_h * 2, 1.0) or long_span < cross_span):
        return []
    ordered = sorted(col, key=lambda item: item[along])
    coords = [item[along] for item in ordered]
    gaps = [b - a for a, b in zip(coords, coords[1:]) if b - a > 0.5]
    pitch = _median(gaps, med_h * 2)
    band = max(med_h * 0.8, min(pitch * 0.45, med_h * 2.2))
    near = max(med_h * 0.4, 2.0)
    attached_by_id = _assign_texts_axis(ordered, texts, along=along, band=band, near=near, far=reach)
    built: list[dict] = []
    for ins in ordered:
        attached = attached_by_id.get(id(ins), [])
        if not attached:
            continue
        row = _row_from_insert(ins, attached, row_index=start_index + len(built))
        text = str(row.get("decodedText") or row.get("rawText") or "")
        if _is_continuation(text):
            row["continuation"] = True
            built.append(row)
            continue
        if not _is_description(text, str(ins.get("block_name") or "")):
            continue
        built.append(row)
    described = [row for row in built if not row.get("continuation")]
    if len(described) < 3 or len(described) / len(col) < 0.5:
        return []
    return built


_CONTINUATION = re.compile(r"(?i)^(כנ[\"'״׳]?ל|as above|ditto|same)\b")
_HEBREW_CHAR = re.compile(r"[\u0590-\u05FF]")
_LATIN_WORD = re.compile(r"[A-Za-z]{2,}")


def _is_continuation(text: str) -> bool:
    return bool(_CONTINUATION.match(" ".join(text.split())))


def _is_description(text: str, block_name: str) -> bool:
    folded = " ".join(text.split())
    if not folded or _is_continuation(folded):
        return False
    if block_name and folded.casefold() == block_name.casefold():
        return False
    if re.fullmatch(r"[\d./\-]+", folded):
        return False
    if _HEBREW_CHAR.search(folded):
        return True
    return bool(_LATIN_WORD.search(folded)) and (" " in folded or len(folded) >= 4)


def _split_runs(col: list[dict], gap: float, axis: str) -> list[list[dict]]:
    ordered = sorted(col, key=lambda item: item[axis])
    runs: list[list[dict]] = []
    for ins in ordered:
        if not runs or ins[axis] - runs[-1][-1][axis] > gap:
            runs.append([ins])
        else:
            runs[-1].append(ins)
    return runs


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


def _cluster_by_y(inserts: list[dict], tol: float) -> list[list[dict]]:
    ordered = sorted(inserts, key=lambda item: (item["y"], item["x"]))
    clusters: list[list[dict]] = []
    for ins in ordered:
        if not clusters or abs(ins["y"] - clusters[-1][-1]["y"]) > tol:
            clusters.append([ins])
        else:
            clusters[-1].append(ins)
    return clusters


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


def _assign_texts_axis(
    col: list[dict],
    texts: list[dict],
    *,
    along: str,
    band: float,
    near: float,
    far: float,
) -> dict[int, list[dict]]:
    cross = "x" if along == "y" else "y"
    buckets: dict[int, list[dict]] = {id(ins): [] for ins in col}
    for text in texts:
        best = None
        best_d = 1e18
        for ins in col:
            along_d = abs(text[along] - ins[along])
            cross_d = abs(text[cross] - ins[cross])
            if along_d > band or cross_d < near or cross_d > far:
                continue
            dist = along_d * 4.0 + cross_d
            if dist < best_d:
                best, best_d = ins, dist
        if best is not None:
            buckets[id(best)].append(text)
    out: dict[int, list[dict]] = {}
    for ins in col:
        picked = buckets[id(ins)]
        if not picked:
            continue
        nearest = min(picked, key=lambda item: (abs(item[along] - ins[along]), abs(item[cross] - ins[cross])))
        side = 1 if nearest[cross] >= ins[cross] else -1
        row = [item for item in picked if (1 if item[cross] >= ins[cross] else -1) == side]
        row.sort(key=lambda item: item[along])
        out[id(ins)] = row[:6]
    return out


def _layout_inserts(ctx: DocContext, layout) -> list[dict]:
    out: list[dict] = []
    for entity in layout:
        if entity.dxftype() != "INSERT":
            continue
        name = str(entity.dxf.name or "")
        if not name or name.startswith("*") or is_xref_block(ctx.doc, name):
            continue
        resolved, _, _ = ctx.resolved_name(name)
        if not resolved or resolved.startswith("*"):
            continue
        out.append(
            dict(
                x=float(entity.dxf.insert.x),
                y=float(entity.dxf.insert.y),
                resolved=resolved,
                block_name=name,
                layer=str(entity.dxf.layer or ""),
            )
        )
    return out


def _layout_texts(ctx: DocContext, layout) -> list[dict]:
    out: list[dict] = []
    for entity in layout:
        if entity.dxftype() not in ("TEXT", "MTEXT"):
            continue
        raw = entity.dxf.text if entity.dxftype() == "TEXT" else entity.text
        raw = str(raw or "").strip()
        if not raw:
            continue
        height = 0.0
        for attr in ("char_height", "height"):
            try:
                height = float(entity.dxf.get(attr, 0) or 0)
            except Exception:
                height = 0.0
            if height:
                break
        out.append(dict(x=float(entity.dxf.insert.x), y=float(entity.dxf.insert.y), raw=raw, font="", big="", height=height))
    return out


def _rows_from_table(
    inserts: list[dict],
    texts: list[dict],
    *,
    med_h: float,
    reach: float,
    start_index: int,
) -> list[dict]:
    """A regular grid: one symbol and one description per cell. A header without a symbol is ignored."""
    if len(inserts) < 4:
        return []
    ys = sorted({round(item["y"], 1) for item in inserts})
    xs = sorted({round(item["x"], 1) for item in inserts})
    if len(ys) < 2 or len(xs) < 2:
        return []
    y_gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > med_h]
    x_gaps = [b - a for a, b in zip(xs, xs[1:]) if b - a > med_h]
    if len(y_gaps) < 1 or len(x_gaps) < 1:
        return []
    y_pitch = _median(y_gaps, med_h * 2)
    x_pitch = _median(x_gaps, med_h * 2)
    if y_pitch <= 0 or x_pitch <= 0:
        return []
    if max(y_gaps) > y_pitch * 1.8 or max(x_gaps) > x_pitch * 1.8:
        return []
    return _rows_from_legend_run(
        inserts,
        texts,
        med_h=med_h,
        span_max=max(reach, max(xs) - min(xs), max(ys) - min(ys)),
        reach=reach,
        along="y",
        start_index=start_index,
        shape="table",
    )


def count_blocks_all_sheets(counts: Counter) -> Counter:
    return counts