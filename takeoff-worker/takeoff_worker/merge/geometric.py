"""Geometric alignment: PDF page content space ↔ DWG preview (viewport plot), not mismatched raw model/pt."""
from __future__ import annotations

import re
from collections import defaultdict

import numpy as np

from ..models import WorkerDetection, WorkerSheet
from .align import apply, fit_similarity, hough_translation, ransac_similarity, umeyama
from .layout_meta import LayoutViewportMeta, load_layout_meta, model_to_layout_paper, paper_to_pdf_pt


def pdf_page_pt_size(pdf_sheet: WorkerSheet, detections: list[WorkerDetection]) -> tuple[float, float]:
    w = float(pdf_sheet.widthPx)
    h = float(pdf_sheet.heightPx)
    if detections:
        mx = max((d.native.x if d.native else d.x) for d in detections)
        my = max((d.native.y if d.native else d.y) for d in detections)
        return max(mx * 1.02, w), max(my * 1.02, h)
    return w, h


def detection_content_xy(
    d: WorkerDetection,
    sheet: WorkerSheet,
    *,
    pdf_page_w: float | None = None,
    pdf_page_h: float | None = None,
) -> tuple[float, float]:
    """Unit-square content coords: PDF uses page-pt / page size; DWG uses preview px / preview size."""
    if d.source == "pdf" and d.native is not None and pdf_page_w and pdf_page_h:
        return float(d.native.x) / pdf_page_w, float(d.native.y) / pdf_page_h
    return float(d.x) / float(sheet.widthPx), float(d.y) / float(sheet.heightPx)


def detection_xy(d: WorkerDetection, sheet: WorkerSheet | None = None, **kw) -> tuple[float, float]:
    if sheet is not None:
        return detection_content_xy(d, sheet, **kw)
    if d.native is not None:
        return float(d.native.x), float(d.native.y)
    return float(d.x), float(d.y)


def class_bucket(d: WorkerDetection) -> str:
    if d.blockName:
        return d.blockName.lower()
    if d.rawClass and not re.match(r"^L\d+$", d.rawClass, re.I):
        return d.rawClass.lower()
    if d.typeKey:
        return d.typeKey.lower()
    if d.legendKey:
        return d.legendKey.lower()
    return "?"


def _classes_compatible(a: str, b: str) -> float:
    if a == "?" or b == "?":
        return 1.0
    if a == b:
        return 0.35
    if a in b or b in a:
        return 0.55
    return 1.0


def content_tol(pdf_sheet: WorkerSheet, *, base: float = 0.02) -> float:
    span = max(float(pdf_sheet.widthPx), float(pdf_sheet.heightPx))
    if span >= 3500:
        return 0.024
    return min(0.028, base * 1.25)


def content_dist_to_pt(dist: float, pdf_w_pt: float, pdf_h_pt: float) -> float:
    return float(dist) * float((pdf_w_pt + pdf_h_pt) / 2.0)


def transform_dwg_via_layout(
    P_model: np.ndarray,
    meta: LayoutViewportMeta,
    *,
    pdf_w_pt: float,
    pdf_h_pt: float,
    rotation_deg: int,
    mirror_y: bool = False,
) -> np.ndarray:
    out = []
    paper_w = meta.vp_width if meta.vp_width > 1 else meta.model_hw * 2
    paper_h = meta.vp_height if meta.vp_height > 1 else meta.model_hh * 2
    for mx, my in P_model:
        px, py = model_to_layout_paper(mx, my, meta)
        tx, ty = paper_to_pdf_pt(
            px,
            py,
            paper_w=paper_w,
            paper_h=paper_h,
            pdf_w_pt=pdf_w_pt,
            pdf_h_pt=pdf_h_pt,
            rotation_deg=rotation_deg,
            mirror_y=mirror_y,
        )
        out.append([tx / pdf_w_pt, ty / pdf_h_pt])
    return np.asarray(out, float)


def align_points(
    P: np.ndarray,
    Q: np.ndarray,
    *,
    tol: float = 0.02,
    class_p: list[str] | None = None,
    class_q: list[str] | None = None,
) -> tuple[float, np.ndarray, np.ndarray, int, str]:
    if len(P) < 3 or len(Q) < 3:
        return 1.0, np.eye(2), np.zeros(2), 0, "none"

    Pc: dict[str, np.ndarray] = defaultdict(list)
    Qc: dict[str, np.ndarray] = defaultdict(list)
    if class_p and class_q:
        for i, c in enumerate(class_p):
            if c != "?":
                Pc[c].append(P[i])
        for i, c in enumerate(class_q):
            if c != "?":
                Qc[c].append(Q[i])
        Pc = {k: np.asarray(v, float) for k, v in Pc.items() if len(v) >= 2}
        Qc = {k: np.asarray(v, float) for k, v in Qc.items() if len(v) >= 2}
        if Pc and Qc:
            ext_q = np.ptp(Q, axis=0)
            ext_p = np.ptp(P, axis=0)
            s0 = float(np.mean(ext_q / np.maximum(ext_p, 1e-9)))
            ht = hough_translation(Pc, Qc, s0, bin_sz=max(tol, 0.008))
            if ht:
                R, t = ht
                X = s0 * (R @ P.T).T + t
                d = np.sqrt(((X[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
                score = int((d.min(axis=1) < tol).sum())
                for _ in range(3):
                    offs = []
                    for cls, Pk in Pc.items():
                        if cls not in Qc:
                            continue
                        Xk = s0 * (R @ Pk.T).T + t
                        dd = np.sqrt(((Xk[:, None, :] - Qc[cls][None, :, :]) ** 2).sum(-1))
                        for row, jj in enumerate(dd.argmin(axis=1)):
                            if dd[row, jj] < tol:
                                offs.append(Qc[cls][jj] - Xk[row])
                    if offs:
                        t = t + np.median(np.asarray(offs), axis=0)
                X = s0 * (R @ P.T).T + t
                d = np.sqrt(((X[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
                score = int((d.min(axis=1) < tol).sum())
                return s0, R, t, score, "hough_class"

    fit = fit_similarity(P, Q, tol=tol)
    if fit:
        sc, R, t, score = fit
        return sc, R, t, score, "fit8"
    ransac = ransac_similarity(P, Q, tol=tol * 1.35, iterations=240, min_samples=3)
    if ransac:
        sc, R, t, score = ransac
        return sc, R, t, score, "ransac"

    ext_q = np.ptp(Q, axis=0)
    ext_p = np.ptp(P, axis=0)
    sc = float(np.mean(ext_q / np.maximum(ext_p, 1e-9)))
    t = Q.mean(0) - sc * P.mean(0)
    return sc, np.eye(2), t, 0, "centroid"


def refine_with_layout_candidates(
    P_model: np.ndarray,
    Q: np.ndarray,
    meta: LayoutViewportMeta | None,
    pdf_w_pt: float,
    pdf_h_pt: float,
    tol: float,
) -> tuple[np.ndarray, int, str]:
    if meta is None or len(P_model) == 0:
        return Q * 0, 0, "none"
    best = (0, None, "none")
    for rot in (0, 90, 180, 270):
        for mir in (False, True):
            X = transform_dwg_via_layout(
                P_model,
                meta,
                pdf_w_pt=pdf_w_pt,
                pdf_h_pt=pdf_h_pt,
                rotation_deg=rot,
                mirror_y=mir,
            )
            if len(X) == 0:
                continue
            d = np.sqrt(((X[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
            score = int((d.min(axis=1) < tol).sum())
            tag = f"layout_rot{rot}" + ("_my" if mir else "")
            if score > best[0]:
                best = (score, X, tag)
    if best[1] is None:
        return Q * 0, 0, "none"
    return best[1], best[0], best[2]


def refine_aligned_points(
    P: np.ndarray,
    Q: np.ndarray,
    X: np.ndarray,
    tol: float,
) -> np.ndarray:
    """Deterministic Umeyama re-fit on initial 1:1 inliers (same tol)."""
    if len(P) < 3 or len(Q) < 3:
        return X
    pairs: list[tuple[int, int]] = []
    for j in range(len(P)):
        d = np.linalg.norm(Q - X[j], axis=1)
        i = int(np.argmin(d))
        if float(d[i]) <= tol:
            pairs.append((j, i))
    if len(pairs) < 8:
        return X
    pts_p = np.array([P[j] for j, _ in pairs], dtype=float)
    pts_q = np.array([Q[i] for _, i in pairs], dtype=float)
    try:
        sc, R, t = umeyama(pts_p, pts_q)
    except Exception:
        return X
    return apply(P, sc, R, t)


def weighted_greedy_match(
    Q: np.ndarray,
    X: np.ndarray,
    class_q: list[str],
    class_x: list[str],
    tol: float,
) -> list[tuple[int, int, float]]:
    edges: list[tuple[float, int, int]] = []
    for i in range(len(Q)):
        for j in range(len(X)):
            dist = float(np.linalg.norm(Q[i] - X[j]))
            if dist > tol:
                continue
            w = dist * _classes_compatible(class_q[i], class_x[j])
            edges.append((w, i, j))
    edges.sort()
    used_q: set[int] = set()
    used_x: set[int] = set()
    out: list[tuple[int, int, float]] = []
    for w, i, j in edges:
        if i in used_q or j in used_x:
            continue
        used_q.add(i)
        used_x.add(j)
        out.append((i, j, float(np.linalg.norm(Q[i] - X[j]))))
    return out


def greedy_match_two_pass(
    Q: np.ndarray,
    X: np.ndarray,
    class_q: list[str],
    class_x: list[str],
    tol: float,
    *,
    loose_factor: float = 1.45,
) -> tuple[list[tuple[int, int, float]], int]:
    """Primary greedy match, then class-compatible leftovers at looser tolerance."""
    first = weighted_greedy_match(Q, X, class_q, class_x, tol)
    used_q = {i for i, _, _ in first}
    used_x = {j for _, j, _ in first}
    tol2 = tol * loose_factor
    edges: list[tuple[float, int, int]] = []
    for i in range(len(Q)):
        if i in used_q:
            continue
        for j in range(len(X)):
            if j in used_x:
                continue
            if class_q[i] == "?" or class_x[j] == "?":
                continue
            if class_q[i] != class_x[j] and class_q[i] not in class_x[j] and class_x[j] not in class_q[i]:
                continue
            dist = float(np.linalg.norm(Q[i] - X[j]))
            if dist > tol2:
                continue
            edges.append((dist, i, j))
    edges.sort()
    second: list[tuple[int, int, float]] = []
    for dist, i, j in edges:
        if i in used_q or j in used_x:
            continue
        used_q.add(i)
        used_x.add(j)
        second.append((i, j, dist))
    return first + second, len(second)


def geometric_align_dwg_to_pdf(
    P: np.ndarray,
    Q: np.ndarray,
    *,
    class_p: list[str],
    class_q: list[str],
    tol: float,
    P_model: np.ndarray | None = None,
    dwg_source_path: str | None = None,
    layout_name: str = "",
    pdf_w_pt: float,
    pdf_h_pt: float,
    pdf_portrait: bool,
    dwg_landscape: bool,
) -> tuple[np.ndarray, int, str, float]:
    """Return aligned DWG points in PDF **content** space (same frame as Q)."""
    sc, R, t, score, method = align_points(P, Q, tol=tol, class_p=class_p, class_q=class_q)
    X = apply(P, sc, R, t)
    if len(X) and len(Q):
        d_fwd = np.sqrt(((X[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
        greedy_score = int((d_fwd.min(axis=1) < tol).sum())
    else:
        greedy_score = score

    need_layout = greedy_score < max(12, int(0.55 * min(len(P), len(Q))))
    meta: LayoutViewportMeta | None = None
    if need_layout and dwg_source_path and layout_name:
        meta = load_layout_meta(dwg_source_path, layout_name)
    if need_layout and P_model is not None and meta is not None:
        rot_guess = 90 if pdf_portrait and dwg_landscape else 0
        for rot in dict.fromkeys([rot_guess, 0, 90, 180, 270]):
            for mir in (False, True):
                Xc = transform_dwg_via_layout(
                    P_model,
                    meta,
                    pdf_w_pt=pdf_w_pt,
                    pdf_h_pt=pdf_h_pt,
                    rotation_deg=rot,
                    mirror_y=mir,
                )
                d = np.sqrt(((Xc[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
                s = int((d.min(axis=1) < tol).sum())
                if s > greedy_score + 5:
                    greedy_score = s
                    X = Xc
                    method = f"layout_paper_rot{rot}" + ("_my" if mir else "")

    if need_layout and greedy_score < max(8, int(0.2 * min(len(P), len(Q)))) and P_model is not None:
        meta = meta or (
            load_layout_meta(dwg_source_path, layout_name) if dwg_source_path and layout_name else None
        )
        Xr, s2, m2 = refine_with_layout_candidates(P_model, Q, meta, pdf_w_pt, pdf_h_pt, tol)
        if s2 > greedy_score + 5:
            X, greedy_score, method = Xr, s2, m2

    if len(P) == len(X):
        X = refine_aligned_points(P, Q, X, tol)
        if method.startswith("fit"):
            method = method + "_refined"

    return X, greedy_score, method, tol