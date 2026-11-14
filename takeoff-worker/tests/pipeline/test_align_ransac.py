from __future__ import annotations

import numpy as np

from takeoff_worker.merge.align import apply, correspondences_from_transform, ransac_similarity, umeyama


def test_umeyama_requires_equal_pairs():
    P = np.array([[0, 0], [1, 0], [0, 1]], float)
    Q = np.array([[1, 1], [2, 1]], float)
    try:
        umeyama(P, Q)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_ransac_unequal_lengths_no_index_error():
    rng = np.random.default_rng(0)
    P = rng.uniform(0, 1, (219, 2))
    Q = rng.uniform(0, 1, (228, 2))
    fit = ransac_similarity(P, Q, tol=0.05, iterations=80)
    assert fit is None or len(fit) == 4


def test_greedy_correspondences_known_similarity():
    rng = np.random.default_rng(3)
    P = rng.uniform(0.1, 0.9, (80, 2))
    sc, ang, t = 1.1, 0.2, np.array([0.05, -0.03])
    R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
    Q_body = (sc * (R @ P.T)).T + t + rng.normal(0, 0.008, P.shape)
    Q = np.vstack([Q_body, rng.uniform(0, 1, (15, 2))])
    sc2, R2, t2 = umeyama(P[:3], Q_body[:3])
    corr = correspondences_from_transform(P, Q, sc2, R2, t2, 0.04)
    assert len(corr) >= int(0.7 * len(P))