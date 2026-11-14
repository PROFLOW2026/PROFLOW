"""Block geometry extraction and normalization fingerprints (chamfer-lite, no OpenCV)."""
from __future__ import annotations

import hashlib
import math
from typing import Iterable

import numpy as np


def block_polys(block) -> list[tuple[list[tuple[float, float]], bool, bool]]:
    polys: list[tuple[list[tuple[float, float]], bool, bool]] = []
    if block is None:
        return polys
    for e in block:
        t = e.dxftype()
        try:
            if t == "LINE":
                polys.append(
                    (
                        [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)],
                        False,
                        False,
                    )
                )
            elif t == "CIRCLE":
                cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                pts = [
                    (cx + r * math.cos(a * math.pi / 12), cy + r * math.sin(a * math.pi / 12))
                    for a in range(25)
                ]
                polys.append((pts, True, False))
            elif t == "ARC":
                cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                a0, a1 = math.radians(e.dxf.start_angle), math.radians(e.dxf.end_angle)
                if a1 < a0:
                    a1 += 2 * math.pi
                n = max(6, int((a1 - a0) / (math.pi / 12)))
                pts = [
                    (
                        cx + r * math.cos(a0 + (a1 - a0) * k / n),
                        cy + r * math.sin(a0 + (a1 - a0) * k / n),
                    )
                    for k in range(n + 1)
                ]
                polys.append((pts, False, False))
            elif t == "LWPOLYLINE":
                pts = [(p[0], p[1]) for p in e.get_points("xy")]
                polys.append((pts, bool(e.closed), False))
            elif t == "SOLID":
                v = [e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx3, e.dxf.vtx2]
                polys.append(([(p.x, p.y) for p in v], True, True))
            elif t == "HATCH":
                for path in e.paths:
                    if hasattr(path, "vertices"):
                        polys.append(([(p[0], p[1]) for p in path.vertices], True, True))
        except Exception:
            continue
    return polys


def block_bbox_center(block) -> tuple[float, float]:
    polys = block_polys(block)
    if not polys:
        return (0.0, 0.0)
    pts = np.array([p for pl, _, _ in polys for p in pl], dtype=float)
    mn, mx = pts.min(0), pts.max(0)
    c = (mn + mx) / 2
    try:
        bp = block.block.dxf.base_point
        c -= np.array([bp.x, bp.y])
    except Exception:
        pass
    return float(c[0]), float(c[1])


def normalize_segments(polys, size: int = 32) -> list[tuple[int, int, int, int]]:
    """Raster-free fingerprint: quantized segments in a unit square."""
    allp = [p for pl, _, _ in polys for p in pl]
    if not allp:
        return []
    arr = np.array(allp, dtype=float)
    mn, mx = arr.min(0), arr.max(0)
    span = max(mx - mn)
    if span < 1e-9:
        span = 1.0
    out: list[tuple[int, int, int, int]] = []
    for pl, _, _ in polys:
        for i in range(len(pl) - 1):
            a = (np.array(pl[i]) - mn) / span * size
            b = (np.array(pl[i + 1]) - mn) / span * size
            out.append(
                (
                    int(round(a[0])),
                    int(round(a[1])),
                    int(round(b[0])),
                    int(round(b[1])),
                )
            )
    out.sort()
    return out


def geometry_hash(polys) -> str:
    segs = normalize_segments(polys)
    h = hashlib.sha1(repr(segs).encode("utf-8")).hexdigest()[:16]
    return f"block:*geom:{h}"


def segments_match(a, b, tol: int = 2) -> float:
    """Fraction of segments in a matched in b (symmetric chamfer-lite)."""
    if not a or not b:
        return 0.0

    def close(p, q):
        return abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol

    hit = 0
    for sa in a:
        for sb in b:
            if (close(sa[:2], sb[:2]) and close(sa[2:], sb[2:])) or (
                close(sa[:2], sb[2:]) and close(sa[2:], sb[:2])
            ):
                hit += 1
                break
    return hit / max(len(a), len(b))