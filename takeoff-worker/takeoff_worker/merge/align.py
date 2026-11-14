"""PDF<->DWG detection alignment (ported from phase2/align.py, scipy-free)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

def umeyama(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    if len(src) < 2 or len(dst) < 2 or len(src) != len(dst):
        raise ValueError("umeyama needs equal-length point pairs")
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s0, d0 = src - mu_s, dst - mu_d
    cov = d0.T @ s0 / len(src)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(2)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[1, 1] = -1
    R = U @ S @ Vt
    var = (s0**2).sum() / len(src)
    sc = float(np.trace(np.diag(D) @ S) / var) if var > 1e-12 else 1.0
    t = mu_d - sc * R @ mu_s
    return sc, R, t


def apply(P: np.ndarray, sc: float, R: np.ndarray, t: np.ndarray) -> np.ndarray:
    return (sc * (R @ P.T)).T + t


def _greedy_nn_pairs(
    src_aligned: np.ndarray,
    Q: np.ndarray,
    tol: float,
) -> list[tuple[int, int, float]]:
    """1:1 nearest-neighbour correspondences from src points (already in Q frame) to Q."""
    if len(src_aligned) == 0 or len(Q) == 0:
        return []
    dmat = np.sqrt(((src_aligned[:, None, :] - Q[None, :, :]) ** 2).sum(-1))
    flat = [(i, j, float(dmat[i, j])) for i in range(len(src_aligned)) for j in range(len(Q))]
    flat.sort(key=lambda x: x[2])
    used_i: set[int] = set()
    used_j: set[int] = set()
    pairs: list[tuple[int, int, float]] = []
    for i, j, dist in flat:
        if dist > tol:
            break
        if i in used_i or j in used_j:
            continue
        used_i.add(i)
        used_j.add(j)
        pairs.append((i, j, dist))
    return pairs


def correspondences_from_transform(
    P: np.ndarray,
    Q: np.ndarray,
    sc: float,
    R: np.ndarray,
    t: np.ndarray,
    tol: float,
) -> list[tuple[int, int]]:
    X = apply(P, sc, R, t)
    pairs = _greedy_nn_pairs(X, Q, tol)
    return [(i, j) for i, j, _ in pairs]


def _hypothesis_corr_pairs(
    P: np.ndarray,
    Q: np.ndarray,
    n: int,
    rng: np.random.Generator,
) -> list[tuple[int, int]]:
    """Guess correspondences via centroid shift + nearest neighbour (for RANSAC hypotheses)."""
    ip = rng.choice(len(P), size=n, replace=False)
    shift = Q.mean(0) - P.mean(0)
    pairs: list[tuple[int, int]] = []
    for i in ip:
        d = np.linalg.norm(Q - (P[i] + shift), axis=1)
        pairs.append((int(i), int(d.argmin())))
    return pairs


def ransac_similarity(
    P: np.ndarray,
    Q: np.ndarray,
    *,
    tol: float = 8.0,
    iterations: int = 120,
    min_samples: int = 3,
) -> tuple[float, np.ndarray, np.ndarray, int] | None:
    """Estimate similarity mapping P -> Q. P and Q may differ in length."""
    if len(P) < min_samples or len(Q) < min_samples:
        return None
    rng = np.random.default_rng(42)
    best_count = 0
    best_params: tuple[float, np.ndarray, np.ndarray] | None = None
    for _ in range(iterations):
        pairs = _hypothesis_corr_pairs(P, Q, min_samples, rng)
        pts_p = np.array([P[i] for i, _ in pairs], dtype=float)
        pts_q = np.array([Q[j] for _, j in pairs], dtype=float)
        try:
            sc, R, t = umeyama(pts_p, pts_q)
        except Exception:
            continue
        corr = correspondences_from_transform(P, Q, sc, R, t, tol)
        cnt = len(corr)
        if cnt > best_count:
            best_count = cnt
            if cnt >= min_samples:
                pts_p = np.array([P[i] for i, _ in corr], dtype=float)
                pts_q = np.array([Q[j] for _, j in corr], dtype=float)
                try:
                    sc, R, t = umeyama(pts_p, pts_q)
                except Exception:
                    sc, R, t = sc, R, t
            best_params = (sc, R, t)
    if best_params is None:
        return None
    sc, R, t = best_params
    return sc, R, t, best_count


def fit_similarity(P: np.ndarray, Q: np.ndarray, tol: float = 6.0, iters: int = 25) -> tuple[float, np.ndarray, np.ndarray, int] | None:
    best = None
    ext_q = np.ptp(Q, axis=0)
    for mir in (1, -1):
        for k in range(4):
            th = k * np.pi / 2
            R0 = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.diag([1.0, float(mir)])
            Pr = (R0 @ P.T).T
            e = np.ptp(Pr, axis=0)
            ext_p = np.maximum(e, 1e-9)
            sc = float(np.mean(ext_q / ext_p))
            t = (Q.min(0) + Q.max(0)) / 2 - sc * ((Pr.min(0) + Pr.max(0)) / 2)
            sc_, R_, t_ = sc, R0, t
            for it in range(iters):
                X = apply(P, sc_, R_, t_)
                corr = correspondences_from_transform(P, Q, sc_, R_, t_, max(tol, 40.0 / (1 + it)))
                if len(corr) < 3:
                    break
                pts_p = np.array([P[i] for i, _ in corr], dtype=float)
                pts_q = np.array([Q[j] for _, j in corr], dtype=float)
                sc2, Rr, tt = umeyama(pts_p, pts_q)
                sc_, R_, t_ = sc2, Rr, tt
            X = apply(P, sc_, R_, t_)
            corr = correspondences_from_transform(P, Q, sc_, R_, t_, tol)
            score = len(corr)
            if best is None or score > best[0]:
                best = (score, sc_, R_, t_)
    if best is None:
        return None
    return best[1], best[2], best[3], best[0]


def hough_translation(
    Pc: dict[str, np.ndarray],
    Qc: dict[str, np.ndarray],
    s: float,
    bin_sz: float = 10.0,
) -> tuple[np.ndarray, np.ndarray] | None:
    best = None
    for mir in (1, -1):
        for k in range(4):
            th = k * np.pi / 2
            R0 = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.diag([1.0, float(mir)])
            votes: dict[tuple[int, int], int] = {}
            for c in Pc:
                if c not in Qc:
                    continue
                P = s * (R0 @ Pc[c].T).T
                Q = Qc[c]
                T = (Q[None, :, :] - P[:, None, :]).reshape(-1, 2)
                keys = np.floor(T / bin_sz).astype(int)
                for kk in map(tuple, keys.tolist()):
                    votes[kk] = votes.get(kk, 0) + 1
            if not votes:
                continue
            kmax = max(votes, key=votes.get)
            sc_votes = votes[kmax]
            if best is None or sc_votes > best[0]:
                best = (sc_votes, R0, (np.array(kmax) + 0.5) * bin_sz)
    if best is None:
        return None
    return best[1], best[2]


@dataclass
class MergePair:
    pdf_id: str
    dwg_id: str
    distance: float


def greedy_match(
    pdf_pts: np.ndarray,
    dwg_pts: np.ndarray,
    pdf_ids: list[str],
    dwg_ids: list[str],
    tol: float,
) -> list[MergePair]:
    if len(pdf_pts) == 0 or len(dwg_pts) == 0:
        return []
    dmat = np.sqrt(((pdf_pts[:, None, :] - dwg_pts[None, :, :]) ** 2).sum(-1))
    pairs: list[MergePair] = []
    used_pdf: set[int] = set()
    used_dwg: set[int] = set()
    flat = [(i, j, dmat[i, j]) for i in range(len(pdf_pts)) for j in range(len(dwg_pts))]
    flat.sort(key=lambda x: x[2])
    for i, j, dist in flat:
        if dist > tol:
            break
        if i in used_pdf or j in used_dwg:
            continue
        used_pdf.add(i)
        used_dwg.add(j)
        pairs.append(MergePair(pdf_ids[i], dwg_ids[j], float(dist)))
    return pairs