"""Distance helpers without scipy (research parity)."""
from __future__ import annotations

import numpy as np


def cdist_min(A: np.ndarray, B: np.ndarray, chunk: int = 2000) -> tuple[np.ndarray, np.ndarray]:
    """For each row of A: min distance to rows of B and its index."""
    d = np.empty(len(A))
    idx = np.empty(len(A), int)
    for i in range(0, len(A), chunk):
        a = A[i : i + chunk]
        D = np.sqrt(((a[:, None, :] - B[None, :, :]) ** 2).sum(-1))
        idx[i : i + chunk] = D.argmin(1)
        d[i : i + chunk] = D.min(1)
    return d, idx