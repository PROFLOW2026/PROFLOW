"""PdfVectorEngine — production PDF takeoff (pypdfium2 only at runtime)."""
from __future__ import annotations

import io
import os
import time
from typing import Callable, Optional

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

from takeoff_worker.engine_api import EngineOutput, LegendTemplate, ProgressFn
from takeoff_worker.models import (
    Confidence,
    JobOptions,
    Native,
    SheetScale,
    SymbolLibraryEntry,
    WorkerDetection,
    WorkerLegendEntry,
    WorkerSheet,
    WorkerWarning,
)

from .cluster import leader_cluster
from . import generic_ops as G
from .geometry import PdfMatrix, PdfRect, media_size_from_view, rotation_matrix
from .hebrew import collect_text_blob, decode_pdf_text
from . import legend as legend_mod
from .legend_detect import filter_glyph_candidates, is_legend_sheet, plan_region
from .library_match import library_templates
from .masks import dominant_hex, is_drawing_noise_mask, mask_signature, mask_to_b64
from .fixture_marks import lighting_point, on_sheet_border, socket_symbol
from .fixture_marks import SocketSymbolFeatures
from .monochrome import (
    attached_symbol_marks,
    black_symbol_candidates,
    lighting_point_features,
    open_circle_marks,
    stair_core_socket_flags,
    stair_marker_ring,
    stroked_symbol_candidates,
    switch_head_and_direction,
    switch_stem_options,
)
from .note_read import read_symbol_words
from .visual_context import visual_context_enabled
from .quantity_notes import SymbolMark, multiplier_notes, socket_quantity
from .switch_identity import SwitchMark, collapse_same_head
from .dedupe import collapse_duplicates
from .heavy_guard import (
    HeavyBudget,
    assess_sheet_heavy,
    cap_legend_comps_prioritize_text,
    cap_plan_candidates,
    cap_templates_for_match,
    prune_subsymbol_drawings,
)
from .legend_zone import (
    detect_legend_zones,
    filter_plan_comps,
    point_in_zones,
    zone_false_positives_in_plan_field,
)
from .pdfium_extract import (
    extract_page_drawings,
    extract_page_text_chars,
    extract_page_text_words,
    page_vector_stats,
)
from .preview import render_page_png
from .scale_parse import parse_scale
from . import shape_engine as E
from .symbol_match import best_stem_match, head_center_pt, stemmed_templates
from .templates import comp_from_legend_template, legend_template_from_comp

ENGINE_VERSION = "pdf_vector/0.1.0"
TAU = E.TAU


def _hint_rect(hints, file_id: str, sheet_key: str, which: str) -> Optional[PdfRect]:
    for h in hints:
        if h.fileId != file_id or h.sheetKey != sheet_key:
            continue
        box = h.legend if which == "legend" else h.plan
        if box:
            return PdfRect(*box)
    return None


def _pt_to_px(x: float, y: float, scale: float) -> tuple[float, float]:
    return x * scale, y * scale


def _clear_device_type(det: dict) -> None:
    """Drop a type the geometry does not support. The mark stays for review."""
    det["cls"] = "UNK"
    det["score"] = None
    det["margin"] = None
    det["conf"] = "none"


def _collapse_same_switch_head(dets: list[dict], stem_origin: set[int]) -> tuple[list[dict], int]:
    """One drawn head is one switch. A bank of heads a gap apart stays a bank."""
    indexed: list[dict] = []
    marks: list[SwitchMark] = []
    for det in dets:
        if id(det["comp"]) not in stem_origin:
            continue
        radius = det.get("head_r")
        if not isinstance(radius, (int, float)) or isinstance(radius, bool) or radius <= 0:
            continue
        dx = float(det.get("stem_dx") or 0.0)
        dy = float(det.get("stem_dy") or 0.0)
        stem = (dx, dy) if dx or dy else None
        indexed.append(det)
        marks.append(SwitchMark(float(det["cx"]), float(det["cy"]), float(radius), stem))
    if len(marks) < 2:
        return dets, 0
    kept = {id(mark) for mark in collapse_same_head(marks)}
    drop = {id(det["comp"]) for det, mark in zip(indexed, marks) if id(mark) not in kept}
    if not drop:
        return dets, 0
    return [det for det in dets if id(det["comp"]) not in drop], len(drop)


def _near_tag(words: list[dict], cx: float, cy: float, limit: float = 22.0) -> Optional[str]:
    best, bd = None, limit
    for w in words:
        if abs(w["cx"] - cx) + abs(w["cy"] - cy) < bd:
            bd = abs(w["cx"] - cx) + abs(w["cy"] - cy)
            best = w["text"]
    return best


def _refresh_legend_template_text(artifacts: dict, file_id: str, rows: list) -> None:
    """Keep the legend-template artifact aligned with OCR-updated row text."""
    import json

    name = f"legend-templates-{file_id}.json"
    raw = artifacts.get(name)
    if not raw:
        return
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return
    by_key = {row.key: row for row in rows}
    for item in payload:
        row = by_key.get(item.get("key"))
        if row is None:
            continue
        item["decoded_text"] = row.decodedText
        if row.rawText:
            item["tag_text"] = row.rawText
    artifacts[name] = json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _legend_crop_png(comp: E.Comp, pad: float = 3.0) -> bytes:
    r = comp.rect
    side = max(r.width, r.height) + 2 * pad
    w, h = max(64, int(side * 4)), max(64, int(side * 4))
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    dr = ImageDraw.Draw(img)
    ox = (w - side * 4) / 2 - r.x0 * 4
    oy = (h - side * 4) / 2 - r.y0 * 4
    for pts, closed, _filled in comp.polys:
        if len(pts) >= 2:
            xy = [(px * 4 + ox, py * 4 + oy) for px, py in pts]
            dr.line(xy, fill=(30, 30, 30, 255), width=1)
            if closed and len(xy) >= 3:
                dr.polygon(xy, outline=(30, 30, 30, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class PdfVectorEngine:
    def analyze(
        self,
        path: str,
        file_id: str,
        *,
        options: JobOptions,
        library: list[SymbolLibraryEntry],
        extra_templates: Optional[list[LegendTemplate]] = None,
        sheet_keys: Optional[set[str]] = None,
        progress: Optional[ProgressFn] = None,
    ) -> EngineOutput:
        out = EngineOutput()
        out.versions = {"pdfEngine": ENGINE_VERSION, "pypdfium2": pdfium.VISION if hasattr(pdfium, "VISION") else "bundled"}

        def prog(stage: str, pct: float, msg: str | None = None) -> None:
            if progress:
                progress(stage, pct, msg)

        extra_templates = extra_templates or []
        lib_tpls = library_templates(library)

        try:
            doc = pdfium.PdfDocument(path)
        except Exception as exc:
            out.warnings.append(
                WorkerWarning(code="pdf_open_failed", severity="error", message=str(exc), fileId=file_id)
            )
            return out

        n_pages = len(doc)
        for page_index in range(n_pages):
            sheet_key = f"p{page_index + 1}"
            if sheet_keys and sheet_key not in sheet_keys:
                continue
            prog("sheets", 100 * page_index / max(n_pages, 1), sheet_key)
            try:
                self._analyze_sheet(
                    doc,
                    page_index,
                    path,
                    file_id,
                    sheet_key,
                    options,
                    lib_tpls,
                    extra_templates,
                    out,
                    prog,
                )
            except Exception as exc:
                out.warnings.append(
                    WorkerWarning(
                        code="sheet_partial",
                        severity="warning",
                        message=f"{sheet_key}: {exc}",
                        fileId=file_id,
                        sheetKey=sheet_key,
                    )
                )
                out.sheets.append(
                    WorkerSheet(
                        sheetKey=sheet_key,
                        fileId=file_id,
                        name=f"{sheet_key}",
                        kind="pdf_page",
                        index=page_index,
                        widthPx=100,
                        heightPx=100,
                        analyzed="partial",
                        note=str(exc),
                    )
                )
        try:
            doc.close()
        except Exception:
            pass
        prog("done", 100.0, None)
        return out

    def _analyze_sheet(
        self,
        doc,
        page_index: int,
        path: str,
        file_id: str,
        sheet_key: str,
        options: JobOptions,
        lib_tpls,
        extra_templates: list[LegendTemplate],
        out: EngineOutput,
        prog: Callable,
    ) -> None:
        page = doc[page_index]
        rot_deg = int(page.get_rotation() or 0) % 360
        # pdfium width/height are the rotated view. rotation_matrix needs the media box.
        vis_w, vis_h = float(page.get_width()), float(page.get_height())
        pw, ph = media_size_from_view(rot_deg, vis_w, vis_h)
        M = rotation_matrix(rot_deg, pw, ph)
        disp_w, disp_h = vis_w, vis_h

        budget = 120.0 if len(doc) == 1 else 75.0

        def _extract_prog(n_obj: int, n_draw: int) -> None:
            prog("extract", min(24.0, 5.0 + n_obj / 25000.0), f"paths {n_draw}/{n_obj}")

        vst = page_vector_stats(page)
        drawings, extract_s = extract_page_drawings(
            page, rot_deg, vis_w, vis_h, budget_sec=budget, progress=_extract_prog
        )
        if len(drawings) == 0 and vst["images"] > 0 and vst["paths"] < 50:
            out.sheets.append(
                WorkerSheet(
                    sheetKey=sheet_key,
                    fileId=file_id,
                    name=sheet_key,
                    kind="pdf_page",
                    index=page_index,
                    widthPx=100,
                    heightPx=100,
                    analyzed="partial",
                    note="raster_plan_unsupported",
                )
            )
            out.warnings.append(
                WorkerWarning(
                    code="raster_plan_unsupported",
                    severity="warning",
                    message="Scanned/raster plan — no reliable vector symbols",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
            return
        if extract_s > budget * 0.95:
            out.warnings.append(
                WorkerWarning(
                    code="extract_budget",
                    severity="warning",
                    message=f"Path extraction budget {budget}s hit ({len(drawings)} items)",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
        if not drawings:
            out.sheets.append(
                WorkerSheet(
                    sheetKey=sheet_key,
                    fileId=file_id,
                    name=sheet_key,
                    kind="pdf_page",
                    index=page_index,
                    widthPx=100,
                    heightPx=100,
                    analyzed="skipped",
                    note="raster_only_pdf",
                )
            )
            out.warnings.append(
                WorkerWarning(
                    code="raster_only_pdf",
                    severity="warning",
                    message="No vector paths on page",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
            return

        heavy_budget = HeavyBudget.from_env()
        heavy_assess = assess_sheet_heavy(vst, len(drawings), disp_w, disp_h, heavy_budget)
        out.stats[f"path_objects_{sheet_key}"] = float(heavy_assess.path_objects)
        out.stats[f"drawing_items_raw_{sheet_key}"] = float(heavy_assess.drawing_items)
        sheet_degraded = False
        if heavy_assess.needs_noise_prune:
            drawings, noise_drop = prune_subsymbol_drawings(drawings, M)
            if noise_drop:
                out.stats[f"pdf_noise_paths_dropped_{sheet_key}"] = float(noise_drop)
                out.warnings.append(
                    WorkerWarning(
                        code="pdf_noise_pruned",
                        severity="info",
                        message=f"Pruned {noise_drop} sub-symbol vector crumbs (<3.5pt)",
                        fileId=file_id,
                        sheetKey=sheet_key,
                    )
                )
            out.stats[f"drawing_items_after_prune_{sheet_key}"] = float(len(drawings))
        if heavy_assess.exceeds_hard:
            sheet_degraded = True
            out.warnings.append(
                WorkerWarning(
                    code="pdf_plan_too_heavy",
                    severity="warning",
                    message=(
                        f"Vector plan exceeds hard path budget ({heavy_assess.reason}); "
                        "symbol counts may be incomplete"
                    ),
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )

        prog("extract", 25, f"paths={len(drawings)}")
        words = extract_page_text_words(page, rot_deg, vis_w, vis_h)
        text_chars, chars_truncated = extract_page_text_chars(page, rot_deg, vis_w, vis_h)
        if chars_truncated:
            out.stats[f"pdf_text_chars_truncated_{sheet_key}"] = 1.0
            out.warnings.append(
                WorkerWarning(
                    code="pdf_text_truncated",
                    severity="info",
                    message="Legend/tag text scan truncated (page text too large)",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
        text_blob = collect_text_blob(words)
        decoded_scale_text = decode_pdf_text(text_blob)
        scale = parse_scale(decoded_scale_text or text_blob)

        prev_bytes, w_px, h_px, px_scale = (None, int(disp_w), int(disp_h), 1.0)
        preview_name = None
        if options.renderPreview:
            prev_bytes, w_px, h_px, px_scale = render_page_png(page, options.previewMaxEdgePx)
            preview_name = f"preview-{file_id}-{sheet_key}.png"
            out.artifacts[preview_name] = prev_bytes

        hint_leg = _hint_rect(options.legendRegionHints, file_id, sheet_key, "legend")
        hint_plan = _hint_rect(options.legendRegionHints, file_id, sheet_key, "plan")
        legend_doc = legend_mod.is_legend_document(path)
        page_area = disp_w * disp_h

        table_rect: Optional[PdfRect] = None
        if legend_doc:
            legend_comps = legend_mod.extract_legend_comps_fullpage(drawings, M)
            legend_rect = PdfRect(0, 0, disp_w, disp_h)
        else:
            legend_comps, table_rect = legend_mod.extract_legend_comps_embedded(
                drawings, M, (disp_w, disp_h), hint_leg
            )
            legend_rect = hint_leg or table_rect
        legend_comps = filter_glyph_candidates(legend_comps)
        legend_sheet = legend_doc or is_legend_sheet(legend_comps, page_area)
        leg_excess = 0
        if len(legend_comps) > heavy_budget.max_legend_rows:
            from .legend_text import legend_row_text_chars

            text_scores: list[int] = []
            for c in legend_comps:
                _raw, dec, _tag, _box, reasons = legend_row_text_chars(text_chars, c, words=words)
                text_scores.append(
                    1 if dec and "legend_text_undecodable" not in reasons else 0
                )
            legend_comps, leg_excess = cap_legend_comps_prioritize_text(
                legend_comps, heavy_budget.max_legend_rows, text_scores
            )
            out.stats[f"legend_rows_capped_{sheet_key}"] = float(leg_excess)
            out.warnings.append(
                WorkerWarning(
                    code="legend_row_cap_exceeded",
                    severity="warning" if (legend_doc or legend_sheet) else "info",
                    message=f"Embedded legend capped to {len(legend_comps)} rows ({leg_excess} omitted)",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
            if legend_doc or legend_sheet:
                sheet_degraded = True

        prog("legend", 45, f"legend={len(legend_comps)}")
        legend_rows: list[WorkerLegendEntry] = []
        legend_tpl_pairs: list[tuple[str, E.Comp]] = []

        build_embedded_legend = legend_doc or legend_sheet
        if not build_embedded_legend and not extra_templates and len(legend_comps) >= 8:
            build_embedded_legend = True
        if legend_comps and build_embedded_legend:
            lrows, _tmpl, arts, lstats = legend_mod.build_legend_worker_entries(
                legend_comps, words, file_id, sheet_key, _legend_crop_png, chars=text_chars
            )
            legend_rows.extend(lrows)
            out.artifacts.update(arts)
            out.stats.update(lstats)
            from .legend_ocr import enrich_legend_rows

            ocr_info = enrich_legend_rows(
                lrows,
                page=page,
                comps=legend_comps[: len(lrows)],
                view_w=disp_w,
                view_h=disp_h,
            )
            for stat_key, stat_val in ocr_info.stats.items():
                out.stats[f"{stat_key}_{sheet_key}"] = stat_val
            if ocr_info.needed and not ocr_info.ran:
                out.warnings.append(
                    WorkerWarning(
                        code="legend_ocr_unavailable",
                        severity="info",
                        message=(
                            "Hebrew legend OCR did not run "
                            "(tesseract with heb is not on PATH, and Windows OCR is unavailable)"
                        ),
                        fileId=file_id,
                        sheetKey=sheet_key,
                    )
                )
            _refresh_legend_template_text(out.artifacts, file_id, lrows)
            out.stats["legend_text_usable"] = float(sum(1 for r in lrows if r.decodedText))
            out.stats["legend_text_undecodable_count"] = float(
                sum(1 for r in lrows if "legend_text_undecodable" in (r.reasons or []))
            )
            embed_pairs, n_dec = legend_mod.plan_template_pairs(lrows, legend_comps)
            out.stats[f"legend_rows_decodable_{sheet_key}"] = float(n_dec)
            legend_tpl_pairs = embed_pairs

        for lt in extra_templates:
            legend_tpl_pairs.append((lt.key, comp_from_legend_template(lt)))

        plan_rect = plan_region(hint_plan, legend_rect, (disp_w, disp_h))
        colored = G.colored_filter
        if legend_comps and not extra_templates and not legend_doc:
            med = float(np.median([max(c.rect.width, c.rect.height) for c in legend_comps]))
            plan = G.core_components(
                drawings,
                M,
                plan_rect,
                max(3.5, 0.35 * med),
                min(120.0, 2.8 * med),
                merge_small_tol=2.0,
            )
        else:
            plan = E.build_components(drawings, M, colored, tol=0.6, min_extent=3.0, max_extent=120.0, region=plan_rect)

        mono_mode = False
        stroked_plan = False
        if len(plan) < 25:
            mono = black_symbol_candidates(drawings, M, plan_rect)
            if len(mono) > len(plan):
                plan = mono
                mono_mode = True
            # Black architectural sheets: walls swallow symbols unless only short strokes are clustered.
            if len(plan) < 40:
                stroked = stroked_symbol_candidates(drawings, M, plan_rect)
                if len(stroked) > max(len(plan), 12):
                    plan = stroked
                    stroked_plan = True
                    mono_mode = True
        # A switch is a circle plus a stem. The stem is often just clear of the
        # head, and a wall-touching cluster throws the whole mark away.
        attached_pairs = attached_symbol_marks(drawings, M, plan_rect, plan)
        stem_origin = {id(comp) for comp, kind in attached_pairs if kind == "stem"}
        socket_origin = {id(comp) for comp, kind in attached_pairs if kind == "socket"}
        if attached_pairs:
            # Keep the plan circles. A rebuilt mark replaces one only after it
            # actually matches the legend stem or the legend socket.
            plan = plan + [comp for comp, _kind in attached_pairs]
            out.stats[f"attached_symbol_marks_{sheet_key}"] = float(len(attached_pairs))
        # An open circle buried in a wall or a caption. A switch stem that
        # matches the legend removes this ring at the same head.
        bare_circles = open_circle_marks(drawings, M, plan_rect, plan, words)
        circle_origin = {id(comp) for comp in bare_circles}
        if bare_circles:
            plan = plan + bare_circles
            out.stats[f"open_circle_marks_{sheet_key}"] = float(len(bare_circles))
        plan = filter_glyph_candidates(plan)
        plan, plan_dropped = cap_plan_candidates(plan, heavy_budget.max_plan_candidates)
        if plan_dropped:
            out.stats[f"pdf_candidates_capped_{sheet_key}"] = float(plan_dropped)
            out.warnings.append(
                WorkerWarning(
                    code="pdf_candidates_capped",
                    severity="warning",
                    message=f"Plan symbol candidates capped ({plan_dropped} dropped, kept {len(plan)})",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )
            sheet_degraded = True

        if legend_doc:
            plan = []

        zone_hint = hint_leg or (table_rect if not legend_doc else None)
        legend_zones = detect_legend_zones((disp_w, disp_h), words, legend_comps, zone_hint)
        plan, zone_excluded = filter_plan_comps(plan, legend_zones)
        out.stats[f"legend_zone_excluded_{sheet_key}"] = float(len(zone_excluded))
        fp = zone_false_positives_in_plan_field(zone_excluded, disp_w, disp_h)
        out.stats[f"legend_zone_false_positive_{sheet_key}"] = float(fp)
        if fp:
            out.warnings.append(
                WorkerWarning(
                    code="legend_zone_imprecision",
                    severity="warning",
                    message=f"{fp} excluded symbol(s) center inside main plan field — review overlay",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )

        prog("classify", 70, f"candidates={len(plan)}")

        match_tpls = list(legend_tpl_pairs)
        if not match_tpls and legend_comps and not legend_rows:
            match_tpls = [(f"L{i + 1}", c) for i, c in enumerate(legend_comps)]
        _tn, max_plan_match = cap_templates_for_match(len(plan), len(match_tpls), heavy_budget)
        if max_plan_match < len(plan):
            plan, extra_drop = cap_plan_candidates(plan, max_plan_match)
            if extra_drop:
                out.stats[f"pdf_match_cells_capped_{sheet_key}"] = float(extra_drop)
                out.warnings.append(
                    WorkerWarning(
                        code="pdf_candidates_capped",
                        severity="warning",
                        message=f"Match budget capped plan candidates ({extra_drop} dropped)",
                        fileId=file_id,
                        sheetKey=sheet_key,
                    )
                )
                sheet_degraded = True

        stem_keys: set[str] = set()
        stem_heads: list[tuple[float, float]] = []
        if match_tpls:
            dets_raw = G.classify_components(plan, legend_comps, match_tpls, tau=TAU)
            prepared = stemmed_templates(match_tpls)
            stem_keys = set(prepared.keys)
            for det in dets_raw:
                # A switch is one empty round head, one short stem that touches
                # it, and a match to a switch row of this sheet's legend.
                # A filled tip or lines that only meet at a tip fail that test
                # even when the chamfer score would pass. Long lines are stripped
                # inside the test so they are neither the stem nor a reason to hide it.
                options = switch_stem_options(drawings, M, det["comp"])
                hits = []
                for cleaned in options:
                    hit = best_stem_match(cleaned, prepared, TAU)
                    if hit is not None:
                        hits.append((cleaned, hit))
                # Geometry can leave more than one stem on a crowded head.
                # The legend agrees with one of them, or the mark is not a switch.
                if len(hits) != 1:
                    if det["cls"] in stem_keys:
                        det["cls"] = "UNK"
                        det["score"] = None
                        det["margin"] = None
                    continue
                cleaned, hit = hits[0]
                key, score, margin = hit
                rect = cleaned.rect
                det["comp"] = cleaned
                det["cls"] = key
                det["best_name"] = key
                det["score"] = score
                det["margin"] = margin
                conf, _ok = E.confidence_from_score(score, margin, TAU)
                det["conf"] = conf
                det["cx"] = (rect.x0 + rect.x1) / 2
                det["cy"] = (rect.y0 + rect.y1) / 2
                det["w"] = rect.width
                det["h"] = rect.height
                head = switch_head_and_direction(drawings, M, cleaned)
                if head is not None:
                    # The viewer mark sits on the head. The box center is pulled down the stem.
                    det["cx"], det["cy"] = head[0], head[1]
                    det["head_r"] = head[2]
                    det["stem_dx"], det["stem_dy"] = head[3], head[4]
                det["n"] = cleaned.n
                det["rad"] = cleaned.rad
                stem_origin.add(id(cleaned))
                head_pt = head_center_pt(cleaned)
                if head_pt is not None:
                    stem_heads.append(head_pt)
                stem_heads.append((det["cx"], det["cy"]))
        else:
            dets_raw = [
                dict(
                    i=i,
                    cls="UNK",
                    score=None,
                    margin=None,
                    conf="none",
                    via="candidate",
                    cx=(c.rect.x0 + c.rect.x1) / 2,
                    cy=(c.rect.y0 + c.rect.y1) / 2,
                    w=c.rect.width,
                    h=c.rect.height,
                    n=c.n,
                    rad=c.rad,
                    comp=c,
                )
                for i, c in enumerate(plan)
            ]

        # A rebuilt stem is kept only when it matches a stemmed legend symbol,
        # and then it replaces the plain circle underneath it. A rebuilt socket
        # is kept only when it matches a legend symbol that is not itself a
        # switch. Anything else from this pass is not a device.
        accepted: list[tuple[float, float]] = []
        confirmed: list[dict] = []
        socket_dets = [det for det in dets_raw if id(det["comp"]) in socket_origin]
        core_flags = stair_core_socket_flags(
            drawings, M, [(det["cx"], det["cy"]) for det in socket_dets]
        )
        core_ids = {id(det["comp"]) for det, on_core in zip(socket_dets, core_flags) if on_core}
        for det in dets_raw:
            origin = id(det["comp"])
            score = det.get("score")
            matched = det["cls"] != "UNK" and score is not None and score <= TAU
            if origin in stem_origin:
                if matched and det["cls"] in stem_keys:
                    accepted.append((det["cx"], det["cy"]))
                    confirmed.append(det)
                continue
            if origin in socket_origin:
                # The goalpost with a note drawn on the arch (the entrance X,
                # a digit sitting in the bowl) chamfers just past the usual
                # line. The same arch without that note matches cleanly.
                # Keep it when it is still the socket and not a switch.
                best = det.get("best_name")
                margin = det.get("margin") or 0.0
                socket_hit = (
                    score is not None
                    and score <= 2.60
                    and margin >= 0.25
                    and best not in (None, "UNK")
                    and best not in stem_keys
                )
                if socket_hit and origin not in core_ids:
                    det["cls"] = best
                    confirmed.append(det)
                continue
            confirmed.append(det)
        dets_raw = []
        for det in confirmed:
            origin = id(det["comp"])
            if origin in stem_origin or origin in socket_origin:
                dets_raw.append(det)
                continue
            cx, cy = det["cx"], det["cy"]
            if any(abs(cx - x) < 10.0 and abs(cy - y) < 10.0 for x, y in accepted):
                continue
            # The bare lighting ring sits on the switch head, not on the stem's
            # bbox center. A matched switch removes it. Anything else stays.
            if origin in circle_origin and any(abs(cx - x) < 8.0 and abs(cy - y) < 8.0 for x, y in stem_heads):
                continue
            dets_raw.append(det)

        dets_raw, collapsed = _collapse_same_switch_head(dets_raw, stem_origin)
        if collapsed:
            out.stats[f"switch_same_head_collapsed_{sheet_key}"] = float(collapsed)

        # A double ring in a fan of stair arrows is the core marker. The same
        # ring is the lowered-ceiling legend, so the match is perfect, and the
        # manual core still has no lighting point. Leave the mark on the sheet
        # without a device type.
        for det in dets_raw:
            if det["cls"] in ("UNK",):
                continue
            comp = det["comp"]
            if len(comp.ids) > 6:
                continue
            if stair_marker_ring(comp, drawings, M):
                det["cls"] = "UNK"
                det["score"] = None
                det["margin"] = None
                det["conf"] = "none"

        for det in dets_raw:
            origin = id(det["comp"])
            if det["cls"] in ("UNK",):
                continue
            if origin in circle_origin:
                features = lighting_point_features(det["comp"], drawings, M, words, disp_w, disp_h)
                if not lighting_point(features):
                    _clear_device_type(det)
                continue
            if origin in socket_origin:
                rect = det["comp"].rect
                cx, cy = det["cx"], det["cy"]
                ink = rect.x0 <= 1.5 or rect.y0 <= 1.5 or rect.x1 >= disp_w - 1.5 or rect.y1 >= disp_h - 1.5
                socket_features = SocketSymbolFeatures(
                    arch=True,
                    stem=True,
                    on_sheet_border=on_sheet_border(cx, cy, disp_w, disp_h, ink),
                    in_arrow_fan=stair_marker_ring(det["comp"], drawings, M),
                )
                if not socket_symbol(socket_features):
                    _clear_device_type(det)

        device_pair: dict[str, int] = {}
        socket_symbols = [
            SymbolMark(
                id=str(id(det["comp"])),
                x=float(det["cx"]),
                y=float(det["cy"]),
                extent=max(float(det["w"]), float(det["h"]), 8.0),
            )
            for det in dets_raw
            if id(det["comp"]) in socket_origin and det["cls"] not in ("UNK",)
        ]
        if socket_symbols:
            crops = [(mark.x, mark.y, mark.extent) for mark in socket_symbols]
            notes = multiplier_notes(read_symbol_words(page, disp_w, disp_h, crops))
            counted = socket_quantity(socket_symbols, notes)
            device_pair = {sid: count for sid, count in counted.assigned if count == 2}
            out.stats[f"socket_symbols_{sheet_key}"] = float(counted.symbol_count)
            out.stats[f"socket_devices_{sheet_key}"] = float(counted.device_count)
            out.stats[f"x2_unassigned_{sheet_key}"] = float(counted.unassigned_notes)

        # Visual context is a second opinion. It is not called unless a provider
        # is configured, so an unset key leaves every legend match as it is.
        out.stats[f"visual_context_{sheet_key}"] = 1.0 if visual_context_enabled() else 0.0

        detections: list[WorkerDetection] = []
        det_id = 0
        lib_by_name = {name: ent for name, _c, ent in lib_tpls}

        for d in dets_raw:
            det_id += 1
            comp: E.Comp = d["comp"]
            cx, cy = d["cx"], d["cy"]
            px, py = _pt_to_px(cx, cy, px_scale)
            classified_by = "none"
            type_key = None
            raw_class = d["cls"]
            conf: Confidence = "none"
            reasons: list = []
            legend_key = None
            score = d.get("score")
            margin = d.get("margin")
            noise = is_drawing_noise_mask(comp.mask, comp.rect.width, comp.rect.height)

            # library override: re-score vs library only
            if lib_tpls and not noise:
                lib_names = [(n, c) for n, c, _ in lib_tpls]
                S, _A, _R = E.match([comp], lib_names)
                if S.size:
                    o = np.argsort(S[:, 0])
                    s1 = float(S[o[0], 0])
                    s2 = float(S[o[1], 0]) if len(o) > 1 else 9.9
                    mgn = s2 - s1
                    if s1 <= TAU:
                        tn = lib_names[int(o[0])][0]
                        type_key = tn
                        classified_by = "library"
                        conf, _ = E.confidence_from_score(s1, mgn, TAU)
                        score, margin = s1, mgn
                        ent = lib_by_name.get(tn)
                        raw_class = ent.signature if ent else tn

            if type_key is None and not noise and d["cls"] not in ("UNK",):
                legend_key = d["cls"]
                raw_class = legend_key
                classified_by = "none"

            if d["via"] == "peel":
                reasons.append("overlapping_symbols_peeled")

            if noise:
                # Vector scraps are not devices. Do not emit them for the bill of quantities.
                continue
            if stroked_plan and raw_class in ("UNK",) and type_key is None:
                # Short-stroke fragments that do not match a legend symbol stay off the sheet.
                # Matches keep their legend key so a manual assignment can label the group.
                continue
            elif type_key is None:
                if "unclassified" not in reasons:
                    reasons.append("unclassified")

            if margin is not None and margin < 0.08 and conf in ("medium", "low"):
                reasons.append("type_ambiguous")

            tag = _near_tag(words, cx, cy)
            if device_pair.get(str(id(comp))) == 2:
                tag = f"{tag} X2".strip() if tag else "X2"
            sig = mask_signature(comp.mask)

            det_pk = f"{sheet_key}#{det_id}"
            out.artifacts[f"{det_pk}-mask.b64"] = mask_to_b64(comp.mask).encode("ascii")
            ang = d.get("angle")
            detections.append(
                WorkerDetection(
                    id=det_pk,
                    sheetKey=sheet_key,
                    fileId=file_id,
                    source="pdf",
                    x=px,
                    y=py,
                    w=comp.rect.width * px_scale,
                    h=comp.rect.height * px_scale,
                    angleDeg=float(ang) if ang is not None else None,
                    signature=sig,
                    signatureKind="pdf-shape",
                    rawClass=raw_class,
                    legendKey=legend_key,
                    colorHex=dominant_hex(dict(comp.colors)),
                    tagText=tag,
                    typeKey=type_key,
                    classifiedBy=classified_by,
                    confidence=conf,
                    score=score,
                    margin=margin,
                    reasons=reasons,
                    native=Native(x=cx, y=cy),
                )
            )

        for ex in zone_excluded:
            det_id += 1
            cx = (ex.rect.x0 + ex.rect.x1) / 2
            cy = (ex.rect.y0 + ex.rect.y1) / 2
            px, py = _pt_to_px(cx, cy, px_scale)
            det_pk = f"{sheet_key}#{det_id}"
            detections.append(
                WorkerDetection(
                    id=det_pk,
                    sheetKey=sheet_key,
                    fileId=file_id,
                    source="pdf",
                    x=px,
                    y=py,
                    w=ex.rect.width * px_scale,
                    h=ex.rect.height * px_scale,
                    signature=mask_signature(ex.mask),
                    signatureKind="pdf-shape",
                    rawClass="legend_margin",
                    colorHex=dominant_hex(dict(ex.colors)),
                    typeKey=None,
                    classifiedBy="none",
                    confidence="none",
                    reasons=["legend_zone"],
                    native=Native(x=cx, y=cy),
                )
            )

        detections, n_dup = collapse_duplicates(detections)
        if n_dup:
            out.stats[f"dedupe_removed_{sheet_key}"] = float(n_dup)
            out.warnings.append(
                WorkerWarning(
                    code="dedupe_collapsed",
                    severity="info",
                    message=f"Collapsed {n_dup} near-duplicate detection(s)",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )

        plan_count = sum(1 for d in detections if "legend_zone" not in d.reasons)
        out.stats[f"plan_quantity_detections_{sheet_key}"] = float(plan_count)
        if zone_excluded:
            out.warnings.append(
                WorkerWarning(
                    code="legend_zone_excluded",
                    severity="info",
                    message=f"Excluded {len(zone_excluded)} in-sheet legend symbols from plan quantities",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )

        # Shape clusters only for symbols that matched neither a legend row nor a library.
        # Legend matches keep their legend key and mask signature for a later manual label.
        # Index by center: noise and unmatched fragments are not emitted, so dets_raw and
        # detections are not the same length.
        unk_dets = [
            d
            for d in detections
            if d.confidence in ("none", "low")
            and "unclassified" in d.reasons
            and not d.legendKey
            and "legend_zone" not in d.reasons
        ]
        if len(unk_dets) >= 5 and not sheet_degraded:
            centers: list[tuple[float, float, E.Comp]] = []
            for raw in dets_raw:
                comp = raw["comp"]
                centers.append(
                    (
                        (comp.rect.x0 + comp.rect.x1) / 2,
                        (comp.rect.y0 + comp.rect.y1) / 2,
                        comp,
                    )
                )
            unk_comps: list[E.Comp] = []
            paired: list[WorkerDetection] = []
            for det in unk_dets:
                match_comp = None
                for ccx, ccy, comp in centers:
                    if abs(det.native.x - ccx) < 0.5 and abs(det.native.y - ccy) < 0.5:
                        match_comp = comp
                        break
                if match_comp is None:
                    continue
                unk_comps.append(match_comp)
                paired.append(det)
            if len(unk_comps) >= 5:
                clusters = leader_cluster(unk_comps)
                for cnum, cl in enumerate(clusters, start=1):
                    sig = mask_signature(unk_comps[cl[0]].mask)
                    for mi in cl:
                        det = paired[mi]
                        det.rawClass = f"C{cnum}"
                        det.signature = sig
                        det.classifiedBy = "shape_cluster"
                        det.typeKey = None
                        det.confidence = "none"
                        if "unclassified" not in det.reasons:
                            det.reasons.append("unclassified")

        base = os.path.basename(path)
        title = decode_pdf_text(text_blob)[:80] if text_blob else None
        sheet_name = base if legend_doc else (title or f"{file_id} {sheet_key}")

        out.legend.extend(legend_rows)
        out.detections.extend(detections)
        out.sheets.append(
            WorkerSheet(
                sheetKey=sheet_key,
                fileId=file_id,
                name=sheet_name,
                kind="pdf_page",
                index=page_index,
                widthPx=w_px,
                heightPx=h_px,
                previewArtifact=preview_name,
                scale=scale,
                analyzed="partial" if sheet_degraded else "full",
                note=(
                    "pdf_heavy_degraded"
                    if sheet_degraded
                    else ("monochrome_fallback" if mono_mode else None)
                ),
            )
        )
        out.stats[f"extract_s_{sheet_key}"] = extract_s
        out.stats[f"path_items_{sheet_key}"] = float(len(drawings))
        out.stats[f"detections_{sheet_key}"] = float(len(detections))

        if mono_mode:
            out.warnings.append(
                WorkerWarning(
                    code="monochrome_fallback",
                    severity="info",
                    message="Used black-symbol heuristic (low confidence)",
                    fileId=file_id,
                    sheetKey=sheet_key,
                )
            )


def templates_from_output(output: EngineOutput) -> list[LegendTemplate]:
    """Alias for :func:`legend.build_legend_templates` (pipeline compatibility)."""
    return legend_mod.build_legend_templates(output)