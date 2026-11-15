"""Generic takeoff operations (legend/plan components, classify)."""
from __future__ import annotations

import collections
from collections import Counter
from typing import Any, Optional

import numpy as np

from .geometry import PdfRect
from . import shape_engine as E


def qcol(c: Optional[tuple[float, float, float]]):
    return tuple(round(v, 1) for v in c) if c is not None else None


def items_in(drawings: list[dict], M, rect: PdfRect) -> list[int]:
    return [i for i, x in enumerate(drawings) if rect.intersects(E.drect(x, M))]


def colored_filter(c: Optional[tuple[float, float, float]]) -> bool:
    return c is not None and not E.is_dark(c) and not E.is_gray(c)


def core_components(
    drawings: list[dict],
    M,
    rect: PdfRect,
    min_ext: float,
    max_ext: float,
    attach_black: bool = True,
    merge_contained: bool = True,
    merge_small_tol: float = 0.0,
    gray_is_structure: bool = True,
    black_is_symbol: bool = False,
) -> list[E.Comp]:
    ids = items_in(drawings, M, rect)

    def kind(i: int) -> str:
        c = E.item_color(drawings[i])
        if c is None:
            return "none"
        if E.is_dark(c):
            return "black"
        if E.is_gray(c):
            return "gray"
        if min(c) > 0.93:
            return "white"
        return "color"

    kinds = {i: kind(i) for i in ids}
    core_ids = [i for i in ids if kinds[i] == "color"]
    by: dict[Any, list[int]] = collections.defaultdict(list)
    for i in core_ids:
        by[qcol(E.item_color(drawings[i]))].append(i)
    pre: list[list] = []
    for col, cid in by.items():
        rects = [E.drect(drawings[i], M) for i in cid]
        for g in E.cluster(rects, tol=0.6):
            rr = None
            for k in g:
                rr = rects[k] if rr is None else (rr | rects[k])
            assert rr is not None
            pre.append([[cid[k] for k in g], rr])
    if merge_small_tol:
        small = [k for k, (_, rr) in enumerate(pre) if max(rr.width, rr.height) < 12]
        sg = E.cluster([pre[k][1] for k in small], tol=merge_small_tol)
        keepl = [pre[k] for k in range(len(pre)) if k not in set(small)]
        for g in sg:
            ii = [x for q in g for x in pre[small[q]][0]]
            rr = None
            for q in g:
                rr = pre[small[q]][1] if rr is None else (rr | pre[small[q]][1])
            assert rr is not None
            keepl.append([list(dict.fromkeys(ii)), rr])
        pre = keepl
    if merge_contained:
        pre.sort(key=lambda p: -(p[1].width * p[1].height))
        out: list[list] = []
        for ids_, rr in pre:
            host = None
            for o in out:
                if max(o[1].width, o[1].height) <= max_ext and o[1].x0 - 1 <= rr.x0 and o[1].y0 - 1 <= rr.y0 and o[1].x1 + 1 >= rr.x1 and o[1].y1 + 1 >= rr.y1:
                    host = o
                    break
            if host is not None:
                host[0] += ids_
            else:
                out.append([list(ids_), PdfRect(rr.x0, rr.y0, rr.x1, rr.y1)])
        pre = out
    if attach_black:
        black = [i for i in ids if kinds[i] == "black"]
        brects = {i: E.drect(drawings[i], M) for i in black}
        for p in pre:
            bb = PdfRect(p[1].x0 - 1.5, p[1].y0 - 1.5, p[1].x1 + 1.5, p[1].y1 + 1.5)
            if max(bb.width, bb.height) > max_ext:
                continue
            for i in black:
                r = brects[i]
                if bb.x0 <= r.x0 and bb.y0 <= r.y0 and bb.x1 >= r.x1 and bb.y1 >= r.y1:
                    p[0].append(i)
    comps: list[E.Comp] = []
    for ids_, rr in pre:
        allr = None
        for i in ids_:
            q = E.drect(drawings[i], M)
            allr = q if allr is None else (allr | q)
        assert allr is not None
        ext = max(allr.width, allr.height)
        if ext < min_ext or ext > max_ext:
            continue
        cols = Counter(
            tuple(round(v, 2) for v in col)
            for i in ids_
            if (col := E.item_color(drawings[i])) is not None and kinds.get(i) == "color"
        )
        comps.append(E.Comp(list(dict.fromkeys(ids_)), drawings, M, cols))
    return comps


def legend_symbol_comps(
    drawings: list[dict],
    M,
    legend_rect: PdfRect,
    min_ext: float = 6.0,
    max_ext: float = 60.0,
    col_tol: float = 3.0,
    min_col: int = 6,
    skip_colors: tuple = (),
) -> list[E.Comp]:
    ids = items_in(drawings, M, legend_rect)
    ids = [i for i in ids if qcol(E.item_color(drawings[i])) not in skip_colors and E.item_color(drawings[i]) is not None]
    by: dict[Any, list[int]] = collections.defaultdict(list)
    for i in ids:
        by[qcol(E.item_color(drawings[i]))].append(i)
    comps: list[E.Comp] = []
    for col, cid in by.items():
        rects = [E.drect(drawings[i], M) for i in cid]
        for g in E.cluster(rects, tol=0.6):
            rr = None
            for k in g:
                rr = rects[k] if rr is None else (rr | rects[k])
            assert rr is not None
            ext = max(rr.width, rr.height)
            if ext < min_ext or ext > max_ext:
                continue
            gi = [cid[k] for k in g]
            cols = Counter(tuple(round(v, 2) for v in E.item_color(drawings[i])) for i in gi)
            comps.append(E.Comp(gi, drawings, M, cols))
    if not comps:
        return []
    xc = np.array([(c.rect.x0 + c.rect.x1) / 2 for c in comps])
    keep = np.zeros(len(comps), bool)
    for k in range(len(comps)):
        if (np.abs(xc - xc[k]) <= col_tol).sum() >= min_col:
            keep[k] = True
    return [c for c, kk in zip(comps, keep) if kk]


def classify_components(
    plan: list[E.Comp],
    legend: list[E.Comp],
    templates: list[tuple[str, E.Comp]],
    tau: float = E.TAU,
    size_gate: tuple[float, float] = (0.55, 1.8),
    do_peel: bool = True,
) -> list[dict]:
    tpl = templates if templates else [("L%d" % i, c) for i, c in enumerate(legend)]
    S, A, R = E.match(plan, tpl, size_gate=size_gate)
    dets: list[dict] = []
    for ci, c in enumerate(plan):
        o = np.argsort(S[:, ci])
        t1 = int(o[0])
        s1 = float(S[t1, ci])
        s2 = float(S[o[1], ci]) if len(o) > 1 else 9.9
        margin = s2 - s1
        cls_name = tpl[t1][0]
        conf, ok = E.confidence_from_score(s1, margin, tau)
        if not ok:
            cls_name = "UNK"
        r = c.rect
        if cls_name == "UNK" and do_peel and c.n >= 6 and max(r.width, r.height) > 14:
            tp = [
                (tpl[k][0], tpl[k][1])
                for k in range(len(tpl))
                if E.color_dist(tpl[k][1].colors, c.colors) <= 0.35 and tpl[k][1].n >= 2
            ]
            pcs = E.peel(c, tp) if tp else []
            if pcs:
                for pc in pcs:
                    dets.append(
                        dict(
                            i=ci,
                            cls=pc["name"],
                            best_name=pc["name"],
                            score=2.0 - pc["cov"],
                            margin=pc["prec"],
                            conf="medium",
                            via="peel",
                            cx=pc["cx"],
                            cy=pc["cy"],
                            w=0,
                            h=0,
                            n=c.n,
                            rad=c.rad,
                            comp=c,
                        )
                    )
                continue
        dets.append(
            dict(
                i=ci,
                cls=cls_name,
                best_name=tpl[t1][0],
                score=s1,
                margin=margin,
                conf=conf if cls_name != "UNK" else "none",
                via="match",
                cx=(r.x0 + r.x1) / 2,
                cy=(r.y0 + r.y1) / 2,
                w=r.width,
                h=r.height,
                n=c.n,
                rad=c.rad,
                tpl=t1,
                tpl_name=cls_name,
                angle=float(A[t1, ci]),
                comp=c,
            )
        )
    return dets