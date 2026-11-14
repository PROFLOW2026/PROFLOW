"""Merge paired PDF + DWG detections (geometric alignment in PDF content space).

Counting: each merged twin pair contributes **one** logical symbol; unmatched PDF/DWG rows
count once each with `pdf_only` / `dwg_only`. On class disagreement within a pair, DWG block
identity wins for `typeKey` and both sides get `type_ambiguous`.
"""
from __future__ import annotations

import re
import uuid
from collections import Counter

import numpy as np

from ..models import WorkerDetection, WorkerSheet, WorkerWarning
from .geometric import (
    class_bucket,
    content_dist_to_pt,
    content_tol,
    detection_content_xy,
    geometric_align_dwg_to_pdf,
    pdf_page_pt_size,
    greedy_match_two_pass,
)


def _plan_pdf(detections: list[WorkerDetection]) -> tuple[list[WorkerDetection], list[WorkerDetection]]:
    plan: list[WorkerDetection] = []
    excluded: list[WorkerDetection] = []
    for d in detections:
        if "legend_zone" in d.reasons:
            excluded.append(d)
        else:
            plan.append(d)
    return plan, excluded


def merge_pdf_dwg_pair(
    pdf_detections: list[WorkerDetection],
    dwg_detections: list[WorkerDetection],
    pdf_sheet: WorkerSheet,
    *,
    dwg_sheet: WorkerSheet | None = None,
    dwg_source_path: str | None = None,
    tol_px: float | None = None,
) -> tuple[list[WorkerDetection], list[WorkerWarning], dict[str, float]]:
    warnings: list[WorkerWarning] = []
    dwg_sheet = dwg_sheet or pdf_sheet
    pdf_plan, pdf_legend_zone = _plan_pdf(pdf_detections)
    # Align on all non-legend-zone plan symbols; margin legend rows must not consume PDF match slots.
    pdf_w_pt, pdf_h_pt = pdf_page_pt_size(pdf_sheet, pdf_plan or pdf_detections)
    tol = (tol_px / ((pdf_w_pt + pdf_h_pt) / 2.0)) if tol_px is not None else content_tol(pdf_sheet)
    if len(dwg_detections) <= 100:
        tol = min(0.028, tol * 1.25)
    stats: dict[str, float] = {
        "merge_pdf_count": float(len(pdf_detections)),
        "merge_pdf_plan_count": float(len(pdf_plan)),
        "merge_dwg_count": float(len(dwg_detections)),
        "merge_tol_content": tol,
        "merge_tol_pt_equiv": content_dist_to_pt(tol, pdf_w_pt, pdf_h_pt),
        "merge_pdf_legend_zone_skipped": float(len(pdf_legend_zone)),
    }

    merged: list[WorkerDetection] = []
    for d in pdf_legend_zone:
        c = d.model_copy(deep=True)
        merged.append(c)

    if not pdf_plan and not dwg_detections:
        return merged, warnings, stats
    if not pdf_plan:
        for d in dwg_detections:
            c = d.model_copy(deep=True)
            c.reasons = [*c.reasons, "dwg_only"]
            merged.append(c)
        return merged, warnings, stats
    if not dwg_detections:
        for d in pdf_plan:
            c = d.model_copy(deep=True)
            c.reasons = [*c.reasons, "pdf_only"]
            merged.append(c)
        return merged, warnings, stats

    Q_align = np.array(
        [detection_content_xy(d, pdf_sheet, pdf_page_w=pdf_w_pt, pdf_page_h=pdf_h_pt) for d in pdf_detections],
        dtype=float,
    )
    Q_match = np.array(
        [detection_content_xy(d, pdf_sheet, pdf_page_w=pdf_w_pt, pdf_page_h=pdf_h_pt) for d in pdf_plan],
        dtype=float,
    )
    P = np.array([detection_content_xy(d, dwg_sheet) for d in dwg_detections], dtype=float)
    P_model = np.array(
        [[float(d.native.x), float(d.native.y)] if d.native else (d.x, d.y) for d in dwg_detections],
        dtype=float,
    )
    class_q_align = [class_bucket(d) for d in pdf_detections]
    class_q = [class_bucket(d) for d in pdf_plan]
    class_p = [class_bucket(d) for d in dwg_detections]

    portrait = float(pdf_sheet.heightPx) > float(pdf_sheet.widthPx)
    landscape = float(dwg_sheet.widthPx) > float(dwg_sheet.heightPx)

    X, align_score, method, _ = geometric_align_dwg_to_pdf(
        P,
        Q_align,
        class_p=class_p,
        class_q=class_q_align,
        tol=tol,
        P_model=P_model,
        dwg_source_path=dwg_source_path,
        layout_name=dwg_sheet.name,
        pdf_w_pt=pdf_w_pt,
        pdf_h_pt=pdf_h_pt,
        pdf_portrait=portrait,
        dwg_landscape=landscape,
    )
    stats["merge_align_score"] = float(align_score)
    stats["merge_align_method_code"] = float(
        {"none": 0, "hough_class": 1, "ransac": 2, "fit8": 3, "centroid": 4}.get(method.split("_")[0], 5)
    )

    loose = 1.35 if len(dwg_detections) > 100 else 1.5
    matches, n_second = greedy_match_two_pass(Q_match, X, class_q, class_p, tol, loose_factor=loose)
    stats["merge_second_pass_pairs"] = float(n_second)
    stats["merge_matched_pairs"] = float(len(matches))
    if pdf_plan:
        stats["merge_match_pct_pdf"] = 100.0 * len(matches) / len(pdf_plan)
    if dwg_detections:
        stats["merge_match_pct_dwg"] = 100.0 * len(matches) / len(dwg_detections)

    residuals_pt = [content_dist_to_pt(m[2], pdf_w_pt, pdf_h_pt) for m in matches]
    if residuals_pt:
        stats["merge_residual_median_pt"] = float(np.median(residuals_pt))
        stats["merge_residual_p90_pt"] = float(np.percentile(residuals_pt, 90))
        stats["merge_residual_median_mm"] = stats["merge_residual_median_pt"] * 25.4 / 72.0

    def content_to_pdf_px(cx: float, cy: float) -> tuple[float, float]:
        return cx * pdf_sheet.widthPx, cy * pdf_sheet.heightPx

    matched_pdf: set[str] = set()
    matched_dwg: set[str] = set()
    type_ambiguous = 0

    for qi, xj, dist in matches:
        pdf_d = pdf_plan[qi]
        dwg_d = dwg_detections[xj]
        twin = f"twin:{uuid.uuid4().hex[:12]}"
        pdf_copy = pdf_d.model_copy(deep=True)
        dwg_copy = dwg_d.model_copy(deep=True)
        pick_type = dwg_copy.typeKey or pdf_copy.typeKey
        type_conflict = bool(
            pdf_copy.typeKey and dwg_copy.typeKey and pdf_copy.typeKey != dwg_copy.typeKey
        )
        if type_conflict:
            pick_type = dwg_copy.typeKey
            type_ambiguous += 1
            pdf_copy.reasons = [*pdf_copy.reasons, "type_ambiguous"]
            dwg_copy.reasons = [*dwg_copy.reasons, "type_ambiguous"]
        conf = "medium" if dist <= tol * 0.65 else "low"
        if pdf_copy.typeKey and dwg_copy.typeKey and pdf_copy.typeKey == dwg_copy.typeKey:
            conf = "high"
        elif type_conflict:
            conf = "low"
        pdf_copy.typeKey = pick_type
        dwg_copy.typeKey = pick_type
        pdf_copy.confidence = conf
        dwg_copy.confidence = conf
        pdf_copy.twinId = twin
        dwg_copy.twinId = twin
        px, py = content_to_pdf_px(float(X[xj, 0]), float(X[xj, 1]))
        dwg_copy.x = px
        dwg_copy.y = py
        merged.append(pdf_copy)
        merged.append(dwg_copy)
        matched_pdf.add(pdf_copy.id)
        matched_dwg.add(dwg_copy.id)

    stats["merge_type_ambiguous"] = float(type_ambiguous)

    pdf_only = 0
    legend_unmatched = 0
    shape_unmatched = 0
    for d in pdf_plan:
        if d.id not in matched_pdf:
            pdf_only += 1
            if re.match(r"^L\d+$", d.rawClass or "", re.I) or (d.legendKey or "").startswith("L"):
                legend_unmatched += 1
            elif d.rawClass and d.rawClass.startswith("block:shape"):
                shape_unmatched += 1
            c = d.model_copy(deep=True)
            if d.confidence == "high":
                c.confidence = "medium"
            c.reasons = [*c.reasons, "pdf_only"]
            merged.append(c)

    dwg_only = 0
    for j, d in enumerate(dwg_detections):
        if d.id not in matched_dwg:
            dwg_only += 1
            c = d.model_copy(deep=True)
            px, py = content_to_pdf_px(float(X[j, 0]), float(X[j, 1]))
            c.x = px
            c.y = py
            c.confidence = "low"
            c.reasons = [*c.reasons, "dwg_only"]
            merged.append(c)

    stats["merge_pdf_only"] = float(pdf_only)
    stats["merge_dwg_only"] = float(dwg_only)
    stats["merge_pdf_only_legend_key"] = float(legend_unmatched)
    stats["merge_pdf_only_shape_fp"] = float(shape_unmatched)

    pdf_by_type = Counter(d.typeKey or d.rawClass or "?" for d in pdf_plan)
    dwg_by_type = Counter(d.typeKey or d.rawClass or "?" for d in dwg_detections)
    match_by_type = Counter()
    for qi, xj, _ in matches:
        k = dwg_detections[xj].typeKey or dwg_detections[xj].rawClass or "?"
        match_by_type[k] += 1
    top = sorted(set(pdf_by_type) | set(dwg_by_type), key=lambda k: -(pdf_by_type[k] + dwg_by_type[k]))[:8]
    for i, k in enumerate(top):
        stats[f"merge_type_{i}_pdf"] = float(pdf_by_type.get(k, 0))
        stats[f"merge_type_{i}_dwg"] = float(dwg_by_type.get(k, 0))
        stats[f"merge_type_{i}_matched"] = float(match_by_type.get(k, 0))

    warnings.append(
        WorkerWarning(
            code="pdf_dwg_merge",
            severity="info",
            message=(
                f"מוזגו {len(matches)} זוגות ({stats.get('merge_match_pct_dwg', 0):.0f}% מ-DWG) "
                f"שיטה={method} tol≈{stats['merge_tol_pt_equiv']:.1f}pt"
            ),
            fileId=pdf_sheet.fileId,
            sheetKey=pdf_sheet.sheetKey,
        )
    )
    if dwg_sheet.hiddenByLayers > 0:
        warnings.append(
            WorkerWarning(
                code="dwg_hidden_layers",
                severity="info",
                message=(
                    f"בלייאאוט {dwg_sheet.name}: {dwg_sheet.hiddenByLayers} סמלים בשכבות מוקפאות/מוסתרות "
                    f"(לא נספרו ב-DWG; לא נדרשים כ-dwg_only ב-BoQ)"
                ),
                fileId=dwg_sheet.fileId,
                sheetKey=dwg_sheet.sheetKey,
            )
        )
    return merged, warnings, stats