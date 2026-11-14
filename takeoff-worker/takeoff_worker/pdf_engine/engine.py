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
from .geometry import PdfMatrix, PdfRect, rotation_matrix
from .hebrew import collect_text_blob, decode_pdf_text
from . import legend as legend_mod
from .legend_detect import filter_glyph_candidates, is_legend_sheet, plan_region
from .library_match import library_templates
from .masks import dominant_hex, mask_signature, mask_to_b64
from .monochrome import black_symbol_candidates
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


def _near_tag(words: list[dict], cx: float, cy: float, limit: float = 22.0) -> Optional[str]:
    best, bd = None, limit
    for w in words:
        if abs(w["cx"] - cx) + abs(w["cy"] - cy) < bd:
            bd = abs(w["cx"] - cx) + abs(w["cy"] - cy)
            best = w["text"]
    return best


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
        rot_deg = page.get_rotation()
        pw, ph = page.get_width(), page.get_height()
        M = rotation_matrix(rot_deg, pw, ph)
        disp_w = ph if rot_deg in (90, 270) else pw
        disp_h = pw if rot_deg in (90, 270) else ph

        budget = 120.0 if len(doc) == 1 else 75.0

        def _extract_prog(n_obj: int, n_draw: int) -> None:
            prog("extract", min(24.0, 5.0 + n_obj / 25000.0), f"paths {n_draw}/{n_obj}")

        vst = page_vector_stats(page)
        drawings, extract_s = extract_page_drawings(
            page, rot_deg, pw, ph, budget_sec=budget, progress=_extract_prog
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
        words = extract_page_text_words(page, rot_deg, pw, ph)
        text_chars, chars_truncated = extract_page_text_chars(page, rot_deg, pw, ph)
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
            embed_pairs, n_dec = legend_mod.templates_for_plan_matching(lrows, legend_comps)
            out.stats[f"legend_rows_decodable_{sheet_key}"] = float(n_dec)
            if embed_pairs:
                legend_tpl_pairs = embed_pairs
            else:
                legend_tpl_pairs = [(r.key, legend_comps[i]) for i, r in enumerate(lrows)]

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
        if len(plan) < 25:
            mono = black_symbol_candidates(drawings, M, plan_rect)
            if len(mono) > len(plan):
                plan = mono
                mono_mode = True
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

        if match_tpls:
            dets_raw = G.classify_components(plan, legend_comps, match_tpls, tau=TAU)
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
            conf: Confidence = d["conf"] if d["cls"] != "UNK" else "none"
            reasons: list = []
            legend_key = None
            score = d.get("score")
            margin = d.get("margin")

            # library override: re-score vs library only
            if lib_tpls:
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

            if type_key is None and d["cls"] not in ("UNK",):
                legend_key = d["cls"]
                raw_class = legend_key
                classified_by = "none"
                if conf != "none":
                    reasons = [r for r in reasons if r != "unclassified"]

            if d["via"] == "peel":
                reasons.append("overlapping_symbols_peeled")

            if type_key is None and conf == "none":
                reasons.append("unclassified")

            if margin is not None and margin < 0.08 and conf in ("medium", "low"):
                reasons.append("type_ambiguous")

            tag = _near_tag(words, cx, cy)
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

        # shape cluster fallback for unclassified
        unk_idx = [i for i, d in enumerate(detections) if d.confidence in ("none", "low") and "unclassified" in d.reasons]
        if unk_idx and len(unk_idx) >= 5 and not sheet_degraded:
            unk_comps = [dets_raw[i]["comp"] for i in range(len(dets_raw)) if detections[i].confidence == "none"]
            if len(unk_comps) >= 5:
                clusters = leader_cluster(unk_comps)
                for ci, mem in enumerate(clusters, start=1):
                    leader = unk_comps[mem[0]]
                    sig = mask_signature(leader.mask)
                    for mi in mem:
                        # map back to detection index — same order as unk_comps subset
                        pass
                # mark clustered detections
                cnum = 0
                for cl in clusters:
                    cnum += 1
                    sig = mask_signature(unk_comps[cl[0]].mask)
                    for mi in cl:
                        # find matching detection by comp center
                        comp = unk_comps[mi]
                        ccx, ccy = (comp.rect.x0 + comp.rect.x1) / 2, (comp.rect.y0 + comp.rect.y1) / 2
                        for det in detections:
                            if det.sheetKey != sheet_key:
                                continue
                            if abs(det.native.x - ccx) < 0.5 and abs(det.native.y - ccy) < 0.5:
                                det.rawClass = f"C{cnum}"
                                det.signature = sig
                                det.classifiedBy = "shape_cluster"
                                det.typeKey = None
                                det.confidence = "low"
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