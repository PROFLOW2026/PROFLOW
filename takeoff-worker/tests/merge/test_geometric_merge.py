from __future__ import annotations

import numpy as np

from takeoff_worker.merge.align import apply
from takeoff_worker.merge.geometric import align_points, weighted_greedy_match


def test_rotated_similarity_align():
    P = np.array([[0, 0], [10, 0], [0, 10], [10, 10], [5, 5]], float)
    R90 = np.array([[0, -1], [1, 0]], float)
    Q = apply(P, 1.2, R90, np.array([100.0, 200.0]))
    sc, R, t, score, _ = align_points(P, Q, tol=14.0)
    X = apply(P, sc, R, t)
    m = weighted_greedy_match(Q, X, ["?"] * len(Q), ["?"] * len(P), 14.0)
    assert len(m) >= 4
    assert score >= 4


def test_class_weighted_prefers_same_name():
    Q = np.array([[10, 10], [20, 20]], float)
    X = np.array([[10.5, 10.2], [50, 50]], float)
    m = weighted_greedy_match(Q, X, ["t20", "t32"], ["t20", "t99"], 12.0)
    assert m[0][0] == 0 and m[0][1] == 0