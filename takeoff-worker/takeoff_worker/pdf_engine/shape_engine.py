"""Shape matching engine (ported from phase-2 research; no PyMuPDF)."""
from __future__ import annotations

import collections
import math
from collections import Counter
from typing import Any, Callable, Optional

import cv2
import numpy as np

from .geometry import PdfMatrix, PdfPoint, PdfRect

K = 220
N = 64
TAU = 2.0


def is_dark(c: Optional[tuple[float, float, float]], thr: float = 0.12) -> bool:
    return c is not None and max(c) < thr


def is_gray(c: Optional[tuple[float, float, float]], tol: float = 0.03) -> bool:
    return c is not None and max(c) - min(c) < tol and 0.12 <= c[0] <= 0.9


def item_color(x: dict[str, Any]) -> Optional[tuple[float, float, float]]:
    return x.get("color") or x.get("fill")


def drect(x: dict[str, Any], M: PdfMatrix) -> PdfRect:
    r = x["rect"]
    if isinstance(r, PdfRect):
        rect = PdfRect(r.x0, r.y0, r.x1, r.y1)
    else:
        rect = PdfRect(r.x0, r.y0, r.x1, r.y1)  # pymupdf oracle in tests
    p0 = PdfPoint(rect.x0, rect.y0) * M
    p1 = PdfPoint(rect.x1, rect.y1) * M
    out = PdfRect(min(p0.x, p1.x), min(p0.y, p1.y), max(p0.x, p1.x), max(p0.y, p1.y))
    out.normalize()
    return out


def cluster(rects: list[PdfRect], tol: float = 0.6, cs: float = 10.0) -> list[list[int]]:
    n = len(rects)
    parent = list(range(n))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    grid: dict[tuple[int, int], list[int]] = collections.defaultdict(list)
    for k, r in enumerate(rects):
        for gx in range(int((r.x0 - tol) // cs), int((r.x1 + tol) // cs) + 1):
            for gy in range(int((r.y0 - tol) // cs), int((r.y1 + tol) // cs) + 1):
                grid[(gx, gy)].append(k)
    for ks in grid.values():
        for a in range(len(ks)):
            ra = rects[ks[a]]
            for b in range(a + 1, len(ks)):
                rb = rects[ks[b]]
                if ra.x0 - tol <= rb.x1 and rb.x0 - tol <= ra.x1 and ra.y0 - tol <= rb.y1 and rb.y0 - tol <= ra.y1:
                    x, y = find(ks[a]), find(ks[b])
                    if x != y:
                        parent[x] = y
    comps: dict[int, list[int]] = collections.defaultdict(list)
    for k in range(n):
        comps[find(k)].append(k)
    return list(comps.values())


def _pt_mul(p: PdfPoint, M: PdfMatrix) -> PdfPoint:
    return p * M


def _bez(p1: PdfPoint, p2: PdfPoint, p3: PdfPoint, p4: PdfPoint, n: int = 8) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        out.append(
            (
                a * p1.x + b * p2.x + c * p3.x + d * p4.x,
                a * p1.y + b * p2.y + c * p3.y + d * p4.y,
            )
        )
    return out


def polys_of(drawings: list[dict], ids: list[int], M: PdfMatrix) -> list[tuple]:
    polys = []
    for i in ids:
        x = drawings[i]
        fill = x.get("fill") is not None
        path: list[tuple[float, float]] = []
        for it in x["items"]:
            k = it[0]
            if k == "l":
                p1, p2 = _pt_mul(it[1], M), _pt_mul(it[2], M)
                if not path:
                    path.append((p1.x, p1.y))
                path.append((p2.x, p2.y))
            elif k == "c":
                pts = _bez(_pt_mul(it[1], M), _pt_mul(it[2], M), _pt_mul(it[3], M), _pt_mul(it[4], M))
                if not path:
                    path.append(pts[0])
                path.extend(pts[1:])
            elif k == "re":
                r = it[1]
                q = [
                    _pt_mul(PdfPoint(r.x0, r.y0), M),
                    _pt_mul(PdfPoint(r.x1, r.y0), M),
                    _pt_mul(PdfPoint(r.x1, r.y1), M),
                    _pt_mul(PdfPoint(r.x0, r.y1), M),
                ]
                polys.append(([(p.x, p.y) for p in q], True, fill))
            elif k == "qu":
                q = it[1]
                pts = [_pt_mul(q.ul, M), _pt_mul(q.ur, M), _pt_mul(q.lr, M), _pt_mul(q.ll, M)]
                polys.append(([(p.x, p.y) for p in pts], True, fill))
        if path:
            polys.append((path, bool(x.get("closePath")) or fill, fill))
    return polys


def raster_polys(polys: list[tuple], size: int = N, thick: int = 1) -> tuple[np.ndarray, tuple[float, float], float]:
    allp = np.array([p for pts, _, _ in polys for p in pts], np.float32)
    if len(allp) < 1:
        return np.zeros((size, size), np.uint8), (0.0, 0.0), 1.0
    (cx, cy), rad = cv2.minEnclosingCircle(allp)
    rad = max(float(rad), 0.3)
    s = (size * 0.46) / rad
    img = np.zeros((size, size), np.uint8)
    sh = 4
    for pts, closed, filled in polys:
        arr = np.array([[(px - cx) * s + size / 2, (py - cy) * s + size / 2] for px, py in pts]) * (1 << sh)
        arr = arr.round().astype(np.int32)
        if filled and len(arr) >= 3:
            cv2.fillPoly(img, [arr], 255, shift=sh)
        cv2.polylines(img, [arr], closed, 255, thick, cv2.LINE_8, shift=sh)
    return img, (cx, cy), rad


def pts_of(mask: np.ndarray, k: int = K, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return np.zeros(k, int), np.zeros(k, int)
    if len(ys) >= k:
        idx = np.random.RandomState(seed).choice(len(ys), k, replace=False)
    else:
        idx = np.random.RandomState(seed).choice(len(ys), k, replace=True)
    return ys[idx], xs[idx]


def dt_of(mask: np.ndarray) -> np.ndarray:
    return cv2.distanceTransform(255 - mask, cv2.DIST_L2, 3)


def variants(img: np.ndarray, step: int = 10) -> list[tuple[np.ndarray, int, int]]:
    out: list[tuple[np.ndarray, int, int]] = []
    c = (img.shape[1] / 2 - 0.5, img.shape[0] / 2 - 0.5)
    for mir in (0, 1):
        base = cv2.flip(img, 1) if mir else img
        for a in range(0, 360, step):
            m = cv2.getRotationMatrix2D(c, a, 1.0)
            out.append((cv2.warpAffine(base, m, img.shape[::-1], flags=cv2.INTER_NEAREST), a, mir))
    return out


class Comp:
    __slots__ = ("ids", "rect", "colors", "polys", "mask", "center", "rad", "dt", "ys", "xs", "n", "diag_pt")

    def __init__(self, ids: list[int], drawings: list[dict], M: PdfMatrix, colors: Counter):
        self.ids = ids
        self.n = len(ids)
        r: Optional[PdfRect] = None
        for i in ids:
            q = drect(drawings[i], M)
            r = q if r is None else (r | q)
        assert r is not None
        self.rect = r
        self.colors = colors
        self.polys = polys_of(drawings, ids, M)
        self.mask, self.center, self.rad = raster_polys(self.polys)
        self.ys, self.xs = pts_of(self.mask)
        self.dt = dt_of(self.mask)
        self.diag_pt = math.hypot(r.width, r.height)


def _qcolor(c: Optional[tuple[float, float, float]]) -> tuple[float, float, float] | int:
    return tuple(round(v, 1) for v in c) if c is not None else 0


def build_components(
    drawings: list[dict],
    M: PdfMatrix,
    color_filter: Callable[[Optional[tuple[float, float, float]]], bool],
    tol: float = 0.6,
    min_n: int = 1,
    max_extent: Optional[float] = None,
    min_extent: float = 0.0,
    region: Optional[PdfRect] = None,
    merge_small_tol: float = 4.0,
    small_extent: float = 12.0,
    per_color: bool = True,
) -> list[Comp]:
    ids = [i for i, x in enumerate(drawings) if color_filter(item_color(x))]
    if region is not None:
        ids = [i for i in ids if region.intersects(drect(drawings[i], M))]
    groups_by_color: dict[Any, list[int]] = collections.defaultdict(list)
    for i in ids:
        groups_by_color[_qcolor(item_color(drawings[i])) if per_color else 0].append(i)
    comps: list[Comp] = []
    for _col, cid in groups_by_color.items():
        rects = [drect(drawings[i], M) for i in cid]
        groups = cluster(rects, tol=tol)
        pre: list[tuple[list[int], PdfRect]] = []
        for g in groups:
            rr: Optional[PdfRect] = None
            for k in g:
                rr = rects[k] if rr is None else (rr | rects[k])
            assert rr is not None
            pre.append(([cid[k] for k in g], rr))
        if merge_small_tol:
            small = [k for k, (_, rr) in enumerate(pre) if max(rr.width, rr.height) < small_extent]
            sr = [pre[k][1] for k in small]
            sg = cluster(sr, tol=merge_small_tol)
            keep = [pre[k] for k in range(len(pre)) if k not in set(small)]
            for g in sg:
                ids_ = [x for q in g for x in pre[small[q]][0]]
                rr = None
                for q in g:
                    rr = pre[small[q]][1] if rr is None else (rr | pre[small[q]][1])
                assert rr is not None
                keep.append((ids_, rr))
            pre = keep
        for gi, rr in pre:
            ext = max(rr.width, rr.height)
            if ext < min_extent or (max_extent and ext > max_extent):
                continue
            cols = Counter(
                tuple(round(v, 2) for v in col)
                for i in gi
                if (col := item_color(drawings[i])) is not None
            )
            if len(gi) >= min_n:
                comps.append(Comp(gi, drawings, M, cols))
    return comps


def batch_scores(cands: list[Comp], tpl: Comp, step: int = 10) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n_c = len(cands)
    if n_c == 0:
        return np.zeros(0), np.zeros(0), np.zeros(0)
    cy = np.stack([c.ys for c in cands])
    cx = np.stack([c.xs for c in cands])
    cdt = np.stack([c.dt for c in cands])
    best = np.full(n_c, 1e9)
    bang = np.zeros(n_c)
    bmir = np.zeros(n_c)
    for vm, a, mir in variants(tpl.mask, step):
        if not vm.any():
            continue
        ty, tx = pts_of(vm)
        tdt = dt_of(vm)
        t1 = cdt[:, ty, tx].mean(1)
        t2 = tdt[cy, cx].mean(1)
        sc = t1 + t2
        better = sc < best
        best = np.where(better, sc, best)
        bang = np.where(better, a, bang)
        bmir = np.where(better, mir, bmir)
    return best, bang, bmir


def color_dist(ca: Counter, cb: Counter) -> float:
    if not ca or not cb:
        return 0.0
    a = max(ca.items(), key=lambda kv: kv[1])[0]
    b = max(cb.items(), key=lambda kv: kv[1])[0]
    return float(np.linalg.norm(np.array(a) - np.array(b)))


def match(
    cands: list[Comp],
    templates: list[tuple[str, Comp]],
    tau: float = TAU,
    step: int = 10,
    size_gate: Optional[tuple[float, float]] = None,
    color_gate: float = 0.35,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    S = np.full((len(templates), len(cands)), 1e9)
    A = np.zeros_like(S)
    for ti, (_, t) in enumerate(templates):
        s, a, _m = batch_scores(cands, t, step)
        S[ti] = s
        A[ti] = a
    for ti, (_, t) in enumerate(templates):
        for ci, c in enumerate(cands):
            if color_dist(t.colors, c.colors) > color_gate:
                S[ti, ci] += 5.0
    R = (
        np.array([[c.rad / max(t.rad, 1e-6) for c in cands] for _, t in templates])
        if cands
        else np.zeros((len(templates), 0))
    )
    if size_gate:
        lo, hi = size_gate
        S = np.where((R < lo) | (R > hi), S + 5.0, S)
    return S, A, R


def confidence_from_score(s1: float, margin: float, tau: float = TAU) -> tuple[str, bool]:
    if s1 > tau:
        return "none", False
    if s1 <= 1.0 and margin >= 0.3:
        return "high", True
    if s1 <= 1.7 and margin >= 0.15:
        return "medium", True
    return "low", True


def _mask_hr(polys: list[tuple], rect: PdfRect, ppp: int, pad: int = 4, thick: int = 2) -> np.ndarray:
    w = int((rect.width + 2 * pad) * ppp) + 2
    h = int((rect.height + 2 * pad) * ppp) + 2
    img = np.zeros((h, w), np.uint8)
    for pts, closed, filled in polys:
        arr = np.array([[(px - rect.x0 + pad) * ppp, (py - rect.y0 + pad) * ppp] for px, py in pts]).round().astype(np.int32)
        if filled and len(arr) >= 3:
            cv2.fillPoly(img, [arr], 255)
        cv2.polylines(img, [arr], closed, 255, thick)
    return img


def peel(
    comp: Comp,
    templates: list[tuple[str, Comp]],
    ppp: int = 6,
    step: int = 15,
    cov_thr: float = 0.90,
    prec_thr: float = 0.55,
    max_iter: int = 6,
) -> list[dict]:
    P = _mask_hr(comp.polys, comp.rect, ppp)
    found: list[dict] = []
    order = sorted(range(len(templates)), key=lambda k: -templates[k][1].rad)
    trs: list[tuple[str, np.ndarray]] = []
    for k in order:
        name, t = templates[k]
        T = _mask_hr(t.polys, t.rect, ppp, pad=1)
        ys, xs = np.nonzero(T)
        if len(ys) == 0:
            continue
        trs.append((name, T[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]))
    for _ in range(max_iter):
        best = None
        Pd = cv2.dilate(P, np.ones((5, 5), np.uint8)).astype(np.float32) / 255
        Pb = (P > 0).astype(np.float32)
        for name, T0 in trs:
            for mir in (0, 1):
                Tm = cv2.flip(T0, 1) if mir else T0
                for a in range(0, 360, step):
                    h, w = Tm.shape
                    S = int(math.hypot(h, w)) + 4
                    can = np.zeros((S, S), np.uint8)
                    can[(S - h) // 2 : (S - h) // 2 + h, (S - w) // 2 : (S - w) // 2 + w] = Tm
                    Mr = cv2.getRotationMatrix2D((S / 2, S / 2), a, 1.0)
                    Tr = (cv2.warpAffine(can, Mr, (S, S), flags=cv2.INTER_LINEAR) > 100).astype(np.uint8)
                    ys, xs = np.nonzero(Tr)
                    if len(ys) == 0:
                        continue
                    Tr = Tr[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float32)
                    if Tr.shape[0] > P.shape[0] or Tr.shape[1] > P.shape[1]:
                        continue
                    Tn = max(float(Tr.sum()), 1.0)
                    cov = cv2.matchTemplate(Pd, Tr, cv2.TM_CCORR) / Tn
                    Td = cv2.dilate(Tr, np.ones((5, 5), np.uint8))
                    inter = cv2.matchTemplate(Pb, Td, cv2.TM_CCORR)
                    tot = cv2.matchTemplate(Pb, np.ones_like(Td), cv2.TM_CCORR)
                    prec = inter / np.maximum(tot, 1.0)
                    sc = np.where((cov >= cov_thr) & (prec >= prec_thr), cov + 0.5 * prec + 0.002 * Tn**0.5, 0)
                    v = float(sc.max())
                    if v > 0 and (best is None or v > best[0]):
                        y, x = np.unravel_index(sc.argmax(), sc.shape)
                        best = (v, name, int(x), int(y), Tr.shape, a, float(cov[y, x]), float(prec[y, x]), Td)
        if best is None:
            break
        _v, name, x, y, shp, a, cov, prec, Td = best
        found.append(
            dict(
                name=name,
                cx=comp.rect.x0 - 4 + (x + shp[1] / 2) / ppp,
                cy=comp.rect.y0 - 4 + (y + shp[0] / 2) / ppp,
                cov=cov,
                prec=prec,
                angle=a,
            )
        )
        P[y : y + shp[0], x : x + shp[1]][Td > 0] = 0
        if (P > 0).sum() < 30:
            break
    return found