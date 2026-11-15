"""Monochrome / B&W symbol candidate extractor (best-effort)."""
from __future__ import annotations

import math
from collections import Counter

from .geometry import PdfMatrix, PdfRect
from . import shape_engine as E


def black_symbol_candidates(
    drawings: list[dict],
    M: PdfMatrix,
    plan_rect: PdfRect,
    min_ext: float = 4.0,
    max_ext: float = 35.0,
    max_stroke_len: float = 80.0,
) -> list[E.Comp]:
    """Black paths only; drop long wall/dimension strokes."""
    ids = []
    rects = []
    for i, x in enumerate(drawings):
        c = E.item_color(x)
        if not E.is_dark(c):
            continue
        r = E.drect(x, M)
        if not plan_rect.intersects(r):
            continue
        if max(r.width, r.height) > max_stroke_len and min(r.width, r.height) < 1.0:
            continue
        ids.append(i)
        rects.append(r)
    if not ids:
        return []
    groups = E.cluster(rects, tol=0.8)
    comps: list[E.Comp] = []
    for g in groups:
        gi = [ids[k] for k in g]
        rr = None
        for k in g:
            rr = rects[k] if rr is None else (rr | rects[k])
        assert rr is not None
        ext = max(rr.width, rr.height)
        ar = rr.width / max(rr.height, 0.01)
        if ext < min_ext or ext > max_ext:
            continue
        if ar > 8 and ext > 20:
            continue
        from collections import Counter

        cols = Counter((0.0, 0.0, 0.0) for _ in gi)
        comps.append(E.Comp(gi, drawings, M, cols))
    return comps


def stroked_symbol_candidates(
    drawings: list[dict],
    M: PdfMatrix,
    plan_rect: PdfRect,
    *,
    max_piece: float = 18.0,
    min_ext: float = 5.0,
    max_ext: float = 34.0,
) -> list[E.Comp]:
    """Cluster short black strokes into symbol-sized marks.

    Long wall and dimension lines are left out so they cannot bridge a socket
    or a luminaire into the room outline. Used when the sheet is stroked in
    black and the coloured-symbol pass finds almost nothing.
    """
    ids: list[int] = []
    rects: list[PdfRect] = []
    for i, drawing in enumerate(drawings):
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        if not plan_rect.intersects(rect):
            continue
        ext = max(rect.width, rect.height)
        if ext < 0.4 or ext > max_piece:
            continue
        ids.append(i)
        rects.append(rect)
    if len(ids) < 8:
        return []
    comps: list[E.Comp] = []
    for group in E.cluster(rects, tol=1.5):
        union: PdfRect | None = None
        for k in group:
            union = rects[k] if union is None else (union | rects[k])
        assert union is not None
        ext = max(union.width, union.height)
        aspect = union.width / max(union.height, 0.01)
        if ext < min_ext or ext > max_ext or aspect < 0.28 or aspect > 3.2:
            continue
        gi = [ids[k] for k in group]
        comps.append(E.Comp(gi, drawings, M, Counter((0.0, 0.0, 0.0) for _ in gi)))
    return comps


def _rect_gap(a: PdfRect, b: PdfRect) -> float:
    if a.x1 < b.x0:
        dx = b.x0 - a.x1
    elif b.x1 < a.x0:
        dx = a.x0 - b.x1
    else:
        dx = 0.0
    if a.y1 < b.y0:
        dy = b.y0 - a.y1
    elif b.y1 < a.y0:
        dy = a.y0 - b.y1
    else:
        dy = 0.0
    return float((dx * dx + dy * dy) ** 0.5)


def _curve_count(drawing: dict) -> int:
    return sum(1 for item in drawing.get("items") or [] if item and item[0] == "c")


def _is_line_ring(drawing: dict, M: PdfMatrix) -> bool:
    """A circle drawn as short chords. Bezier circles are handled separately."""
    items = drawing.get("items") or []
    if not (10 <= len(items) <= 24):
        return False
    pts: list[tuple[float, float]] = []
    for item in items:
        if not item or item[0] != "l":
            return False
        for point in item[1:3]:
            pts.append(M.transform_point(point.x, point.y))
    if len(pts) < 16:
        return False
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    rads = [math.hypot(p[0] - cx, p[1] - cy) for p in pts]
    mean = sum(rads) / len(rads)
    if mean < 2.5:
        return False
    var = sum((r - mean) ** 2 for r in rads) / len(rads)
    if (var ** 0.5) / mean > 0.12:
        return False
    angs = sorted(math.atan2(p[1] - cy, p[0] - cx) for p in pts)
    gaps = [angs[i + 1] - angs[i] for i in range(len(angs) - 1)]
    gaps.append(angs[0] + 2 * math.pi - angs[-1])
    return max(gaps) < (50.0 * math.pi / 180.0)


def _bar_axis(rect: PdfRect) -> str:
    return "h" if rect.width >= rect.height else "v"


def _goalpost_pair(arch: PdfRect, indexed: list[tuple[int, PdfRect]]) -> list[int]:
    """The upright and the crossbar.

    The two nearest strokes are sometimes the upright drawn twice. A real
    goalpost has those strokes on opposite axes. Callers already required two
    strokes within the usual gap, so a sheet that matched before still matches.
    """
    if len(indexed) < 2:
        return [index for index, _rect in indexed]
    first_i, first_r = indexed[0]
    second_i, second_r = indexed[1]
    if _bar_axis(first_r) != _bar_axis(second_r) and _rect_gap(arch, second_r) <= 2.2:
        return [first_i, second_i]
    for index, rect in indexed[1:]:
        if _bar_axis(rect) == _bar_axis(first_r):
            continue
        if _rect_gap(arch, rect) <= 4.5:
            return [first_i, index]
    near = [index for index, rect in indexed if _rect_gap(arch, rect) <= 2.2]
    return near[:2]


def attached_symbol_marks(
    drawings: list[dict],
    M: PdfMatrix,
    plan_rect: PdfRect,
    existing: list[E.Comp],
) -> list[tuple[E.Comp, str]]:
    """Circle-plus-stem and compact bodies the wall cluster swallowed.

    A switch is a round head and a short stem. Clustering every touching stroke
    chains the stem into the wall and the mark is discarded, so nothing on the
    plan receives the legend's switch or socket key. Rebuild the mark from the
    head and the strokes that touch the head only.
    """
    pieces: list[tuple[int, PdfRect]] = []
    curves: list[int] = []
    items_n: list[int] = []
    for i, drawing in enumerate(drawings):
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        if not plan_rect.intersects(rect):
            continue
        ext = max(rect.width, rect.height)
        if ext < 2.0 or ext > 22.0:
            continue
        pieces.append((i, rect))
        curves.append(_curve_count(drawing))
        items_n.append(len(drawing.get("items") or []))
    if len(pieces) < 4:
        return []

    taken = {i for comp in existing for i in comp.ids}

    out: list[tuple[E.Comp, str]] = []
    emitted: list[tuple[float, float]] = []
    # The ring of a rebuilt switch. A goalpost next to that switch is another
    # device: only the head, not the stem's far end, may hide the arch.
    stem_heads: list[tuple[float, float]] = []
    socket_centers: list[tuple[float, float]] = []

    def remember(rect: PdfRect) -> None:
        emitted.append(((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2))

    def _center(rect: PdfRect) -> tuple[float, float]:
        return (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2

    def already(rect: PdfRect) -> bool:
        cx, cy = _center(rect)
        return any(abs(cx - x) < 5.0 and abs(cy - y) < 5.0 for x, y in emitted)

    def socket_blocked(rect: PdfRect) -> bool:
        cx, cy = _center(rect)
        if any(abs(cx - x) < 5.0 and abs(cy - y) < 5.0 for x, y in socket_centers):
            return True
        return any(abs(cx - x) < 6.0 and abs(cy - y) < 6.0 for x, y in stem_heads)

    def _stem_like(prect: PdfRect) -> bool:
        long = max(prect.width, prect.height)
        short = min(prect.width, prect.height)
        # Plan stems run a little longer than the legend stub. A wall is longer still.
        return 6.0 <= long <= 22.0 and 0.35 <= short <= 4.5 and long / max(short, 0.01) >= 1.8

    def _socket_bar(prect: PdfRect) -> bool:
        """A goalpost foot: the short bar or the stem, not a digit and not a hatch tick."""
        long = max(prect.width, prect.height)
        short = min(prect.width, prect.height)
        if not (7.0 <= long <= 16.0 and 0.4 <= short <= 7.5):
            return False
        return long / max(short, 0.01) >= 1.25

    def _owner_extent(drawing_id: int) -> float:
        for comp in existing:
            if drawing_id in comp.ids:
                return max(comp.rect.width, comp.rect.height)
        return 0.0

    # Round head + the stem that touches it. The stem is a short bar, not a wall
    # and not the digits of the circuit number.
    for k, (sid, rect) in enumerate(pieces):
        ext = max(rect.width, rect.height)
        aspect = rect.width / max(rect.height, 0.01)
        round_head = curves[k] >= 4 or _is_line_ring(drawings[sid], M)
        if not round_head or not (5.0 <= ext <= 14.5) or not (0.80 <= aspect <= 1.25):
            continue
        if already(rect):
            continue
        gap_limit = 3.0
        if sid in taken:
            # Rebuild only when this head's cluster does not already hold the stem.
            # A wall or a caption swallowed the circle; the stem is the stroke that
            # actually touches the head.
            owner_ids: set[int] = set()
            owner_ext = 0.0
            for comp in existing:
                if sid in comp.ids:
                    owner_ids = set(comp.ids)
                    owner_ext = max(comp.rect.width, comp.rect.height)
                    break
            held = False
            for j, (pid, prect) in enumerate(pieces):
                if pid in owner_ids and pid != sid and _stem_like(prect):
                    held = True
                    break
            if held and owner_ext < 28.0:
                continue
            gap_limit = 1.2
        partners = [
            j
            for j, (_pid, prect) in enumerate(pieces)
            if j != k and _rect_gap(rect, prect) <= gap_limit and _stem_like(prect)
        ]
        if not partners:
            continue
        partners.sort(key=lambda j: _rect_gap(rect, pieces[j][1]))
        ids = [sid] + [pieces[j][0] for j in partners[:2]]
        union = rect
        for j in partners[:2]:
            union = union | pieces[j][1]
        if max(union.width, union.height) > 28.0 or min(union.width, union.height) < 4.0:
            continue
        out.append((E.Comp(ids, drawings, M, Counter((0.0, 0.0, 0.0) for _ in ids)), "stem"))
        stem_heads.append(_center(rect))
        remember(union)
        if len(out) >= 200:
            break

    # Socket: the arch is one path and the stem/bar are the two straight strokes
    # that touch it. Taking every nearby stroke pulls in the circuit number and
    # the legend socket no longer matches.
    sockets = 0
    for k, (sid, rect) in enumerate(pieces):
        if sockets >= 140:
            break
        ext = max(rect.width, rect.height)
        aspect = rect.width / max(rect.height, 0.01)
        if not (5 <= items_n[k] <= 8) or socket_blocked(rect):
            continue
        if sid in taken:
            # A tight mark that already holds the goalpost bars is the socket.
            # A tight mark that is only the arch, or the arch plus a digit, is not:
            # the legend socket is the arch plus those bars. A wider cluster has
            # pulled the circuit number in, and that cluster does not match.
            owner_ext = _owner_extent(sid)
            if owner_ext < 24.0:
                owner_ids: set[int] = set()
                for comp in existing:
                    if sid in comp.ids:
                        owner_ids = set(comp.ids)
                        break
                bars = 0
                for j, (pid, prect) in enumerate(pieces):
                    if pid not in owner_ids or pid == sid or items_n[j] != 1:
                        continue
                    if _socket_bar(prect):
                        bars += 1
                if bars >= 1:
                    continue
        if not (11.0 <= ext <= 18.0) or min(rect.width, rect.height) < 6.0:
            continue
        if not (0.45 <= aspect <= 0.90 or 1.11 <= aspect <= 2.20):
            continue
        if curves[k] >= 4:
            continue
        touch = [
            j
            for j, (_pid, prect) in enumerate(pieces)
            if j != k and items_n[j] == 1 and _rect_gap(rect, prect) <= 4.5 and _socket_bar(prect)
        ]
        touch.sort(key=lambda j: _rect_gap(rect, pieces[j][1]))
        close = [j for j in touch if _rect_gap(rect, pieces[j][1]) <= 2.2]
        if len(close) < 2:
            continue
        # The two closest strokes are sometimes the upright drawn twice, or the
        # upright and a leader. A goalpost is one upright and one crossbar.
        chosen = _goalpost_pair(rect, [(j, pieces[j][1]) for j in touch])
        ids = [sid] + [pieces[j][0] for j in chosen]
        union = rect
        for j in chosen:
            union = union | pieces[j][1]
        if max(union.width, union.height) > 24.0 or min(union.width, union.height) < 6.0:
            continue
        out.append((E.Comp(ids, drawings, M, Counter((0.0, 0.0, 0.0) for _ in ids)), "socket"))
        socket_centers.append(_center(union))
        remember(union)
        sockets += 1
    return out


def _ring_center(rect: PdfRect) -> tuple[float, float, float]:
    cx = (rect.x0 + rect.x1) / 2
    cy = (rect.y0 + rect.y1) / 2
    return cx, cy, max(rect.width, rect.height) / 2


def open_circle_marks(
    drawings: list[dict],
    M: PdfMatrix,
    plan_rect: PdfRect,
    existing: list[E.Comp],
    words: list[dict] | None = None,
) -> list[E.Comp]:
    """Empty rings a wall or a caption swallowed, each as its own symbol.

    A lighting point on these sheets is an open circle. Clustering pulls in the
    table, the room label, or a wall tick, and the mark no longer matches the
    legend circle.     The ring path by itself still does. A letter, a cross, or a second ring
    inside the circle is not a lighting point. A ring that is already its own
    tight mark is left alone. A real switch still wins later: its stem match
    removes the bare ring at the same head.
    """
    pieces: list[tuple[int, PdfRect]] = []
    for i, drawing in enumerate(drawings):
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        if not plan_rect.intersects(rect):
            continue
        ext = max(rect.width, rect.height)
        if ext < 2.0 or ext > 22.0:
            continue
        pieces.append((i, rect))
    if len(pieces) < 4:
        return []

    out: list[E.Comp] = []
    emitted: list[tuple[float, float]] = []
    for sid, rect in pieces:
        ext = max(rect.width, rect.height)
        aspect = rect.width / max(rect.height, 0.01)
        if not (12.0 <= ext <= 20.0) or not (0.82 <= aspect <= 1.22):
            continue
        drawing = drawings[sid]
        if not (_curve_count(drawing) >= 4 or _is_line_ring(drawing, M)):
            continue
        cx, cy, rad = _ring_center(rect)
        if any(abs(cx - x) < 4.0 and abs(cy - y) < 4.0 for x, y in emitted):
            continue
        if _gray_in_ring(drawings, M, cx, cy, rad) >= 4:
            # The gray disk at a stair-arrow tip is not a luminaire.
            continue
        blocked = False
        for pid, prect in pieces:
            if pid == sid:
                continue
            pcx, pcy, _pr = _ring_center(prect)
            if math.hypot(pcx - cx, pcy - cy) <= 0.55 * rad and max(prect.width, prect.height) >= 2.5:
                # Letter drawn as paths, a cross, or the inner ring of a bullseye.
                blocked = True
                break
        if not blocked and words:
            for word in words:
                if math.hypot(float(word["cx"]) - cx, float(word["cy"]) - cy) <= 0.50 * rad:
                    # A letter sitting in the circle (ש, נ, A7) is not a lighting point.
                    blocked = True
                    break
        if blocked:
            continue
        already = False
        for comp in existing:
            ccx = (comp.rect.x0 + comp.rect.x1) / 2
            ccy = (comp.rect.y0 + comp.rect.y1) / 2
            if math.hypot(ccx - cx, ccy - cy) <= 4.0 and max(comp.rect.width, comp.rect.height) <= ext * 1.35:
                already = True
                break
        if already:
            continue
        out.append(E.Comp([sid], drawings, M, Counter((0.0, 0.0, 0.0) for _ in [sid])))
        emitted.append((cx, cy))
        if len(out) >= 80:
            break
    return out


def lighting_point_features(comp: E.Comp, drawings: list[dict], M: PdfMatrix, words: list[dict] | None, page_w: float, page_h: float):
    """Measure one ring so :func:`lighting_point` can accept or reject it.

    The numbers come from this component and the strokes around it. No sheet
    total and no project coordinate is used.
    """
    from .fixture_marks import LightingPointFeatures, on_sheet_border

    rect = comp.rect
    ext = max(rect.width, rect.height)
    aspect = rect.width / max(rect.height, 0.01)
    cx = (rect.x0 + rect.x1) / 2.0
    cy = (rect.y0 + rect.y1) / 2.0
    rad = max(ext / 2.0, 0.5)
    gray = _gray_in_ring(drawings, M, cx, cy, rad)
    inner = False
    own = set(comp.ids)
    for drawing_id, drawing in enumerate(drawings):
        if drawing_id in own or not E.is_dark(E.item_color(drawing)):
            continue
        other = E.drect(drawing, M)
        other_ext = max(other.width, other.height)
        if other_ext < 2.5 or other_ext > ext * 0.85:
            continue
        ocx, ocy, _orad = _ring_center(other)
        if math.hypot(ocx - cx, ocy - cy) <= 0.55 * rad:
            inner = True
            break
    word_inside = False
    if words:
        for word in words:
            if math.hypot(float(word["cx"]) - cx, float(word["cy"]) - cy) <= 0.50 * rad:
                word_inside = True
                break
    ink_reaches_edge = (
        rect.x0 <= 1.5 or rect.y0 <= 1.5 or rect.x1 >= page_w - 1.5 or rect.y1 >= page_h - 1.5
    )
    return LightingPointFeatures(
        extent=ext,
        aspect=aspect,
        gray_inside=gray,
        inner_mark=inner,
        word_inside=word_inside,
        has_stem=bool(switch_stem_options(drawings, M, comp)),
        in_arrow_fan=stair_marker_ring(comp, drawings, M),
        on_sheet_border=on_sheet_border(cx, cy, page_w, page_h, ink_reaches_edge),
    )


def stair_marker_ring(comp: E.Comp, drawings: list[dict], M: PdfMatrix) -> bool:
    """A concentric double ring sitting in a fan of stair arrows.

    The lowered-ceiling legend is the same double ring. On a stair the ring is
    the core marker, and the manual count gives that core no lighting point.
    A room luminaire does not sit among several long diagonals.
    """
    rings: list[PdfRect] = []
    for drawing_id in comp.ids:
        drawing = drawings[drawing_id]
        if not (_curve_count(drawing) >= 4 or _is_line_ring(drawing, M)):
            continue
        rect = E.drect(drawing, M)
        if max(rect.width, rect.height) < 8.0:
            continue
        rings.append(rect)
    if len(rings) < 2:
        return False
    rings.sort(key=lambda rect: max(rect.width, rect.height))
    inner, outer = rings[0], rings[-1]
    icx = (inner.x0 + inner.x1) / 2
    icy = (inner.y0 + inner.y1) / 2
    ocx = (outer.x0 + outer.x1) / 2
    ocy = (outer.y0 + outer.y1) / 2
    if math.hypot(icx - ocx, icy - ocy) > 3.5:
        return False
    if max(inner.width, inner.height) > 0.8 * max(outer.width, outer.height):
        return False
    diagonals = 0
    for drawing in drawings:
        if not E.is_dark(E.item_color(drawing)):
            continue
        rect = E.drect(drawing, M)
        long = max(rect.width, rect.height)
        short = min(rect.width, rect.height)
        # Stair arrows are short diagonal segments, not one long shaft.
        if long < 8.0 or short > 6.0 or rect.width < 3.0 or rect.height < 3.0:
            continue
        rcx = (rect.x0 + rect.x1) / 2
        rcy = (rect.y0 + rect.y1) / 2
        if abs(rcx - ocx) > 130.0 or abs(rcy - ocy) > 130.0:
            continue
        diagonals += 1
        if diagonals >= 25:
            return True
    return False


_gray_points_cache: dict[int, list[tuple[float, float]]] = {}


def _gray_points(drawings: list[dict], M: PdfMatrix) -> list[tuple[float, float]]:
    key = id(drawings)
    cached = _gray_points_cache.get(key)
    if cached is not None:
        return cached
    points: list[tuple[float, float]] = []
    for drawing in drawings:
        if not E.is_gray(drawing.get("fill")):
            continue
        rect = E.drect(drawing, M)
        points.append(((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2))
    _gray_points_cache.clear()
    _gray_points_cache[key] = points
    return points


def _gray_in_ring(drawings: list[dict], M: PdfMatrix, cx: float, cy: float, rad: float) -> int:
    """Gray fill strokes sitting inside a ring. A stair-arrow tip is packed with them."""
    limit = 0.72 * rad
    limit2 = limit * limit
    count = 0
    for gx, gy in _gray_points(drawings, M):
        if abs(gx - cx) > limit or abs(gy - cy) > limit:
            continue
        if (gx - cx) ** 2 + (gy - cy) ** 2 <= limit2:
            count += 1
            if count >= 4:
                return count
    return count


def _one_line(drawing: dict) -> bool:
    items = drawing.get("items") or []
    return len(items) == 1 and bool(items[0]) and items[0][0] == "l"


def _to_display(drawing: dict, M: PdfMatrix, x: float, y: float) -> tuple[float, float]:
    """One path point in the same space as ``E.drect``.

    Stored rects are y-down. Path points stay y-up unless this drawing records
    the media height used when the rect was flipped.
    """
    media_h = drawing.get("media_h")
    if media_h is None:
        px, py = M.transform_point(x, y)
    else:
        px, py = M.transform_point(x, float(media_h) - y)
    return (float(px), float(py))


def _line_pieces(
    drawing: dict, M: PdfMatrix
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Every straight piece of a path, in display space.

    A stem and its end tick are often one path. A circle is many short chords.
    Each piece is judged on its own, so the tick and the chords are not the stem.
    """
    pieces: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for item in drawing.get("items") or []:
        if not item or item[0] != "l":
            continue
        pieces.append(
            (
                _to_display(drawing, M, item[1].x, item[1].y),
                _to_display(drawing, M, item[2].x, item[2].y),
            )
        )
    return pieces


def _point_on_segment(
    px: float, py: float, a: tuple[float, float], b: tuple[float, float]
) -> tuple[float, float]:
    """Distance from the point to the segment, and where along it the foot falls."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    if length2 < 1e-6:
        return math.hypot(px - a[0], py - a[1]), 0.0
    t = ((px - a[0]) * dx + (py - a[1]) * dy) / length2
    clamped = min(1.0, max(0.0, t))
    qx, qy = a[0] + clamped * dx, a[1] + clamped * dy
    return math.hypot(px - qx, py - qy), t


def _round_head(drawing: dict, M: PdfMatrix) -> tuple[float, float, float] | None:
    if not (_curve_count(drawing) >= 4 or _is_line_ring(drawing, M)):
        return None
    rect = E.drect(drawing, M)
    ext = max(rect.width, rect.height)
    aspect = rect.width / max(rect.height, 0.01)
    if not (5.0 <= ext <= 14.5) or not (0.80 <= aspect <= 1.25):
        return None
    return _ring_center(rect)


def _filled_tip(drawings: list[dict], M: PdfMatrix, drawing: dict, cx: float, cy: float, rad: float) -> bool:
    """A tip that is filled, not an empty ring. The fill may be the path or gray strokes inside it."""
    fill = drawing.get("fill")
    if E.is_gray(fill) or (fill is not None and E.is_dark(fill)):
        return True
    return _gray_in_ring(drawings, M, cx, cy, rad) >= 4


def _crosses_head(
    a: tuple[float, float], b: tuple[float, float], cx: float, cy: float, rad: float
) -> bool:
    """The head sits in the middle of the line. A stem leaves the rim; it does not run through."""
    dist, t = _point_on_segment(cx, cy, a, b)
    return dist < 0.75 * rad and 0.2 <= t <= 0.8


def _touches_rim(
    a: tuple[float, float], b: tuple[float, float], cx: float, cy: float, rad: float
) -> bool:
    """One end meets the circle and the stroke leaves it.

    A line that only passes beside the head, and a chord of the circle itself,
    do not. Digits and hatch ticks fail this. A wall that ends on the rim still
    passes, and the chain-length test turns that wall back out.
    """
    ends = (math.hypot(a[0] - cx, a[1] - cy), math.hypot(b[0] - cx, b[1] - cy))
    near = [dist for dist in ends if rad - 1.5 <= dist <= rad + 6.0]
    if not near:
        return False
    return max(ends) >= min(near) + 4.0


def _stem_chains(
    drawings: list[dict],
    M: PdfMatrix,
    head_id: int,
    cx: float,
    cy: float,
    rad: float,
) -> list[list[int]]:
    """One chain per short stem that leaves the head.

    Nearby strokes are joined when they continue the same line. A chain that
    touches the rim and is longer than a stem is a wall, so it is not a stem.
    An arrow tip is two strokes that are not colinear, so it is not one stem.
    """
    stem_limit = 22.0
    reach = rad + 30.0
    pieces: list[tuple[int, tuple[float, float], tuple[float, float], float, bool]] = []
    for drawing_id, drawing in enumerate(drawings):
        if not E.is_dark(E.item_color(drawing)):
            continue
        for a, b in _line_pieces(drawing, M):
            if max(a[0], b[0]) < cx - reach or min(a[0], b[0]) > cx + reach:
                continue
            if max(a[1], b[1]) < cy - reach or min(a[1], b[1]) > cy + reach:
                continue
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            if length < 1.5 or length > 80.0 or _crosses_head(a, b, cx, cy, rad):
                continue
            touches = _touches_rim(a, b, cx, cy, rad)
            # The circle's own chords stay out. A stem drawn in the same path
            # as the head is kept, because it leaves the rim.
            if drawing_id == head_id and not touches:
                continue
            pieces.append((drawing_id, a, b, length, touches))
    # A stem may be several short pieces with a slight bend. Follow the one
    # direction that leaves the rim. A corner, a tick, or an arrow tip stops
    # the walk. A walk longer than a stem is a wall.
    nodes: list[tuple[float, float]] = []

    def _node(point: tuple[float, float]) -> int:
        for index, other in enumerate(nodes):
            if math.hypot(point[0] - other[0], point[1] - other[1]) <= 2.2:
                return index
        nodes.append(point)
        return len(nodes) - 1

    edges: list[tuple[int, int, int, float]] = []
    for drawing_id, a, b, length, _touches in pieces:
        edges.append((_node(a), _node(b), drawing_id, length))
    adj: list[list[int]] = [[] for _ in nodes]
    for index, (n0, n1, _drawing_id, _length) in enumerate(edges):
        adj[n0].append(index)
        adj[n1].append(index)

    def _dir(n0: int, n1: int) -> tuple[float, float]:
        vx, vy = nodes[n1][0] - nodes[n0][0], nodes[n1][1] - nodes[n0][1]
        norm = math.hypot(vx, vy) or 1.0
        return vx / norm, vy / norm

    def _follow(start: int, edge_index: int) -> tuple[float, list[int]]:
        n0, n1, drawing_id, length = edges[edge_index]
        node = n1 if n0 == start else n0
        direction = _dir(start, node)
        total = length
        ids = [drawing_id]
        seen = {edge_index}
        while total <= stem_limit + 8.0:
            onward = []
            for candidate in adj[node]:
                if candidate in seen:
                    continue
                c0, c1, _cid, _clen = edges[candidate]
                nxt = c1 if c0 == node else c0
                turned = _dir(node, nxt)
                if direction[0] * turned[0] + direction[1] * turned[1] < 0.70:
                    continue
                onward.append(candidate)
            if len(onward) != 1:
                break
            edge_index = onward[0]
            seen.add(edge_index)
            c0, c1, drawing_id, length = edges[edge_index]
            nxt = c1 if c0 == node else c0
            direction = _dir(node, nxt)
            node = nxt
            total += length
            ids.append(drawing_id)
        return total, ids

    found: list[tuple[float, list[int], tuple[float, float]]] = []
    for edge_index, (n0, n1, _drawing_id, _length) in enumerate(edges):
        for start, other in ((n0, n1), (n1, n0)):
            dist = math.hypot(nodes[start][0] - cx, nodes[start][1] - cy)
            far = math.hypot(nodes[other][0] - cx, nodes[other][1] - cy)
            if not (rad - 1.5 <= dist <= rad + 6.0) or far < dist + 3.0:
                continue
            total, ids = _follow(start, edge_index)
            if 6.0 <= total <= stem_limit:
                found.append((total, ids, _dir(start, other)))
    # The same stem stroked twice shares a direction. Keep the short copy.
    chains: list[list[int]] = []
    used_found = [False] * len(found)
    for index, (total, ids, direction) in enumerate(found):
        if used_found[index]:
            continue
        cluster = [index]
        used_found[index] = True
        for other_index, (_ot, _oids, other_direction) in enumerate(found):
            if used_found[other_index]:
                continue
            dot = abs(direction[0] * other_direction[0] + direction[1] * other_direction[1])
            if dot > 0.96:
                used_found[other_index] = True
                cluster.append(other_index)
        best = min(cluster, key=lambda item: found[item][0])
        chains.append(list(dict.fromkeys(found[best][1])))
    return chains


def switch_stem_options(drawings: list[dict], M: PdfMatrix, comp: E.Comp) -> list[E.Comp]:
    """One component per stem that leaves the single empty head.

    A filled tip has no option. A line through the head is not a stem. Each
    option is head plus one stem. The legend decides which option is the
    switch; geometry does not pick by a similarity score.
    """
    heads: list[tuple[int, float, float, float]] = []
    for drawing_id in comp.ids:
        found = _round_head(drawings[drawing_id], M)
        if found is None:
            continue
        cx, cy, rad = found
        if any(math.hypot(cx - ox, cy - oy) < 2.0 for _i, ox, oy, _r in heads):
            continue
        heads.append((drawing_id, cx, cy, rad))
    if len(heads) != 1:
        return []
    head_id, cx, cy, rad = heads[0]
    if _filled_tip(drawings, M, drawings[head_id], cx, cy, rad):
        return []
    chains = _stem_chains(drawings, M, head_id, cx, cy, rad)
    options: list[E.Comp] = []
    for chain in chains:
        ids = list(dict.fromkeys([head_id, *chain]))
        options.append(E.Comp(ids, drawings, M, Counter((0.0, 0.0, 0.0) for _ in ids)))
    return options


def switch_head_and_direction(
    drawings: list[dict], M: PdfMatrix, comp: E.Comp
) -> tuple[float, float, float, float, float] | None:
    """Head center, radius, and the direction from the head toward the stem.

    None when the component is not one empty round head. The direction is the
    shift from the head to the component center, which the stem pulls. A zero
    direction means the stem side is unknown and identity uses distance only.
    """
    heads: list[tuple[float, float, float]] = []
    for drawing_id in comp.ids:
        found = _round_head(drawings[drawing_id], M)
        if found is None:
            continue
        cx, cy, rad = found
        if any(math.hypot(cx - ox, cy - oy) < 2.0 for ox, oy, _rad in heads):
            continue
        heads.append((cx, cy, rad))
    if len(heads) != 1:
        return None
    cx, cy, rad = heads[0]
    bx = (comp.rect.x0 + comp.rect.x1) / 2.0
    by = (comp.rect.y0 + comp.rect.y1) / 2.0
    return cx, cy, rad, bx - cx, by - cy


def switch_head_and_stem(drawings: list[dict], M: PdfMatrix, comp: E.Comp) -> E.Comp | None:
    """The mark when it has one empty head and exactly one short stem."""
    options = switch_stem_options(drawings, M, comp)
    if len(options) != 1:
        return None
    return options[0]


def stair_core_socket_flags(
    drawings: list[dict],
    M: PdfMatrix,
    socket_centers: list[tuple[float, float]],
) -> list[bool]:
    """Goalposts on the stair-core wall.

    The manual core has no sockets. Arrow tips are the gray-filled rings in the
    fan. A goalpost on that wall, above the fan, is outside both apartments.
    A goalpost in a room does not share that wall line.
    """
    flags = [False] * len(socket_centers)
    arrows: list[tuple[float, float]] = []
    for drawing in drawings:
        if not E.is_dark(E.item_color(drawing)):
            continue
        if not (_curve_count(drawing) >= 4 or _is_line_ring(drawing, M)):
            continue
        rect = E.drect(drawing, M)
        ext = max(rect.width, rect.height)
        if not (11.0 <= ext <= 18.0):
            continue
        cx, cy, rad = _ring_center(rect)
        if _gray_in_ring(drawings, M, cx, cy, rad) < 4:
            continue
        arrows.append((cx, cy))
    if len(arrows) < 3:
        return flags
    cluster: list[tuple[float, float]] = []
    for ax, ay in arrows:
        group = [(bx, by) for bx, by in arrows if abs(bx - ax) <= 80.0 and abs(by - ay) <= 80.0]
        if len(group) > len(cluster):
            cluster = group
    if len(cluster) < 3:
        return flags
    arrow_top = min(y for _x, y in cluster)
    columns: list[float] = []
    for index, (x, y) in enumerate(socket_centers):
        dist = min(math.hypot(x - ax, y - ay) for ax, ay in cluster)
        xdist = min(abs(x - ax) for ax, ay in cluster)
        if dist <= 80.0 and xdist <= 22.0:
            flags[index] = True
            columns.append(x)
    if not columns:
        return flags
    for index, (x, y) in enumerate(socket_centers):
        if flags[index] or y > arrow_top + 12.0 or arrow_top - y > 260.0:
            continue
        if any(abs(x - column) <= 6.0 for column in columns):
            flags[index] = True
    return flags
