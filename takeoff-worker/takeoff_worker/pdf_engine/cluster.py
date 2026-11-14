"""Legend-free leader clustering (shape-only)."""
from __future__ import annotations

import numpy as np

from . import shape_engine as E


def leader_cluster(cands: list[E.Comp], tau: float = 1.4, size_gate: tuple[float, float] = (0.6, 1.7)) -> list[list[int]]:
    n = len(cands)
    un = set(range(n))
    clusters: list[list[int]] = []
    order = sorted(range(n), key=lambda i: -cands[i].n)
    while un:
        L = next(i for i in order if i in un)
        S, _A, _R = E.match([cands[k] for k in un], [("x", cands[L])], size_gate=size_gate)
        lst = sorted(un)
        mem = [lst[j] for j in range(len(lst)) if S[0, j] <= tau]
        if L not in mem:
            mem.append(L)
        clusters.append(mem)
        un -= set(mem)
    clusters.sort(key=lambda m: -len(m))
    return clusters