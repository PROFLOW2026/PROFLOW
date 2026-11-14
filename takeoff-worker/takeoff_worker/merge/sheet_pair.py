"""Heuristic PDF plan sheet <-> DWG layout pairing."""
from __future__ import annotations

import re
from collections import defaultdict

import numpy as np

from ..models import WorkerDetection, WorkerSheet
from .align import apply, fit_similarity
from .geometric import (
    class_bucket,
    content_tol,
    detection_content_xy,
    pdf_page_pt_size,
    weighted_greedy_match,
)

_LAYOUT_TAIL = re.compile(
    r"(תאורה|חשמל|לוחות|מקרא)\s*([א-ת]|[גד])",
    re.I,
)


def _norm(name: str) -> str:
    n = re.sub(r"\s+", " ", (name or "").strip().lower())
    n = re.sub(r"[^\w\u0590-\u05ff ]+", "", n)
    return n


def layout_hint_from_pdf_filename(pdf_file_name: str | None) -> str:
    if not pdf_file_name:
        return ""
    base = pdf_file_name.replace(".pdf", "").replace(".PDF", "")
    base = re.sub(r"^\d+[-_a-z0-9]*[-_]", "", base, flags=re.I)
    m = _LAYOUT_TAIL.search(base)
    if m:
        return f"{m.group(1)} {m.group(2)}".strip()
    return re.sub(r"\s+", " ", base).strip()


def _name_score(pdf_hint: str, dwg_name: str) -> int:
    ph, dn = _norm(pdf_hint), _norm(dwg_name)
    if not ph or not dn:
        return 0
    if ph == dn:
        return 100
    if ph in dn or dn in ph:
        return 80
    score = 0
    for token in ph.split():
        if len(token) >= 2 and token in dn:
            score += 12
    return score


def _quick_align_pairs(
    pdf_dets: list[WorkerDetection],
    dwg_dets: list[WorkerDetection],
    pdf_sheet: WorkerSheet,
    dwg_sheet: WorkerSheet,
) -> int:
    if len(pdf_dets) < 3 or len(dwg_dets) < 3:
        return 0
    pdf_w, pdf_h = pdf_page_pt_size(pdf_sheet, pdf_dets)
    tol = content_tol(pdf_sheet)
    Q = np.array(
        [detection_content_xy(d, pdf_sheet, pdf_page_w=pdf_w, pdf_page_h=pdf_h) for d in pdf_dets],
        dtype=float,
    )
    P = np.array([detection_content_xy(d, dwg_sheet) for d in dwg_dets], dtype=float)
    fit = fit_similarity(P, Q, tol=tol)
    if not fit:
        return 0
    sc, R, t, _ = fit
    X = apply(P, sc, R, t)
    cq = [class_bucket(d) for d in pdf_dets]
    cp = [class_bucket(d) for d in dwg_dets]
    return len(weighted_greedy_match(Q, X, cq, cp, tol))


def pick_dwg_sheet_for_pdf(
    pdf_sheet: WorkerSheet,
    dwg_sheets: list[WorkerSheet],
    *,
    pdf_file_name: str | None = None,
    pdf_detections: list[WorkerDetection] | None = None,
    dwg_detections_by_sheet: dict[str, list[WorkerDetection]] | None = None,
) -> tuple[WorkerSheet | None, str]:
    if not dwg_sheets:
        return None, "none"
    if len(dwg_sheets) == 1:
        return dwg_sheets[0], "only"

    hint = layout_hint_from_pdf_filename(pdf_file_name) or pdf_sheet.name
    pdf_dets = [
        d
        for d in (pdf_detections or [])
        if d.source == "pdf" and "legend_zone" not in d.reasons
    ]
    dwg_by_key = dwg_detections_by_sheet or {}
    rows: list[tuple[int, int, WorkerSheet]] = []
    for ds in dwg_sheets:
        ns = _name_score(hint, ds.name)
        dd = [d for d in dwg_by_key.get(ds.sheetKey, []) if d.source == "dwg"]
        ap = _quick_align_pairs(pdf_dets, dd, pdf_sheet, ds) if pdf_dets and dd else 0
        rows.append((ns, ap, ds))

    for ns, _, ds in rows:
        if ns >= 100:
            return ds, "filename_exact"
    for ns, _, ds in rows:
        if ns >= 80:
            return ds, "filename"

    ns, _, ds = max(rows, key=lambda t: t[0])
    if ns >= 12:
        return ds, "filename"

    if pdf_dets:
        name_best = max(rows, key=lambda t: t[0])
        content_best = max(rows, key=lambda t: t[1])
        if (
            content_best[1] > name_best[1] + 8
            and content_best[1] >= max(8, int(0.35 * len(dwg_by_key.get(content_best[2].sheetKey, []))))
        ):
            return content_best[2], "content"

    return ds, "filename" if ns >= 12 else "default"


def match_dwg_sheet_for_pdf(
    pdf_sheet: WorkerSheet,
    dwg_sheets: list[WorkerSheet],
    *,
    pdf_file_name: str | None = None,
    pdf_detections: list[WorkerDetection] | None = None,
    dwg_detections_by_sheet: dict[str, list[WorkerDetection]] | None = None,
) -> WorkerSheet | None:
    sheet, _ = pick_dwg_sheet_for_pdf(
        pdf_sheet,
        dwg_sheets,
        pdf_file_name=pdf_file_name,
        pdf_detections=pdf_detections,
        dwg_detections_by_sheet=dwg_detections_by_sheet,
    )
    return sheet


def filter_detections(detections: list[WorkerDetection], sheet: WorkerSheet) -> list[WorkerDetection]:
    return [d for d in detections if d.fileId == sheet.fileId and d.sheetKey == sheet.sheetKey]


def index_dwg_by_sheet(detections: list[WorkerDetection], dwg_file_id: str) -> dict[str, list[WorkerDetection]]:
    out: dict[str, list[WorkerDetection]] = defaultdict(list)
    for d in detections:
        if d.fileId == dwg_file_id and d.source == "dwg":
            out[d.sheetKey].append(d)
    return dict(out)