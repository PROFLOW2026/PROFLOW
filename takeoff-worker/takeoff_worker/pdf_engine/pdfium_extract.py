"""Vector extraction via pypdfium2 (Apache-2.0). Produces PyMuPDF ``get_drawings``-like dicts."""
from __future__ import annotations

import ctypes
import time
from typing import Any, Callable, Optional

import pypdfium2.raw as pdfium_c
from pypdfium2._helpers.matrix import PdfMatrix as PdfiumMatrix

from .geometry import PdfMatrix, PdfPoint, PdfRect, display_bounds_from_pdf

FPDF_SEGMENT_MOVETO = 2
FPDF_SEGMENT_BEZIERTO = 1
FPDF_SEGMENT_LINETO = 0


def _pdfium_matrix_to_ours(m: PdfiumMatrix) -> PdfMatrix:
    return PdfMatrix(m.a, m.b, m.c, m.d, m.e, m.f)


def _color_component(v: ctypes._CData) -> float:
    return max(0.0, min(1.0, v.value / 255.0))


def _read_color(obj, stroke: bool) -> Optional[tuple[float, float, float]]:
    r, g, b, a = ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint()
    fn = pdfium_c.FPDFPageObj_GetStrokeColor if stroke else pdfium_c.FPDFPageObj_GetFillColor
    if not fn(obj, ctypes.byref(r), ctypes.byref(g), ctypes.byref(b), ctypes.byref(a)):
        return None
    return (_color_component(r), _color_component(g), _color_component(b))


def _transform(matrix: PdfMatrix, x: float, y: float) -> tuple[float, float]:
    return matrix.transform_point(x, y)


def _bezier_controls(obj, seg_index: int) -> Optional[tuple[float, float, float, float, float, float]]:
    """Return (x1,y1,x2,y2,x3,y3) bezier endpoint in path space."""
    x1, y1 = ctypes.c_float(), ctypes.c_float()
    x2, y2 = ctypes.c_float(), ctypes.c_float()
    x3, y3 = ctypes.c_float(), ctypes.c_float()
    ok = pdfium_c.FPDFPath_GetBezierControlPoints(
        obj, seg_index, ctypes.byref(x1), ctypes.byref(y1),
        ctypes.byref(x2), ctypes.byref(y2), ctypes.byref(x3), ctypes.byref(y3),
    )
    if not ok:
        return None
    return (x1.value, y1.value, x2.value, y2.value, x3.value, y3.value)


def _path_items(obj, matrix: PdfMatrix, rot_m: PdfMatrix, page_h: float) -> tuple[list[tuple], PdfRect, bool]:
    """Build path items; apply object then page-rotation matrix (display space)."""
    full = rot_m * matrix
    seg_count = pdfium_c.FPDFPath_CountSegments(obj)
    if seg_count < 0:
        return [], PdfRect(0, 0, 0, 0), False

    items: list[tuple] = []
    pts: list[tuple[float, float]] = []
    close_path = False
    prev: Optional[tuple[float, float]] = None

    for si in range(seg_count):
        seg = pdfium_c.FPDFPath_GetPathSegment(obj, si)
        if not seg:
            continue
        seg_type = pdfium_c.FPDFPathSegment_GetType(seg)
        x, y = ctypes.c_float(), ctypes.c_float()
        if not pdfium_c.FPDFPathSegment_GetPoint(seg, ctypes.byref(x), ctypes.byref(y)):
            continue
        px, py = _transform(full, x.value, y.value)
        if pdfium_c.FPDFPathSegment_GetClose(seg):
            close_path = True

        if seg_type == FPDF_SEGMENT_MOVETO:
            prev = (px, py)
            continue
        if seg_type == FPDF_SEGMENT_LINETO and prev is not None:
            p1, p2 = PdfPoint(*prev), PdfPoint(px, py)
            items.append(("l", p1, p2))
            pts.extend([prev, (px, py)])
            prev = (px, py)
        elif seg_type == FPDF_SEGMENT_BEZIERTO:
            # Prefer chord fallback (GetBezierControlPoints ctypes layout varies by pdfium build).
            if prev is not None:
                p1, p2 = PdfPoint(*prev), PdfPoint(px, py)
                items.append(("l", p1, p2))
                pts.extend([prev, (px, py)])
                prev = (px, py)
    if not pts:
        l, b, r, t = ctypes.c_float(), ctypes.c_float(), ctypes.c_float(), ctypes.c_float()
        if pdfium_c.FPDFPageObj_GetBounds(obj, l, b, r, t):
            rect = display_bounds_from_pdf(l.value, b.value, r.value, t.value, page_h)
        else:
            rect = PdfRect(0, 0, 0, 0)
        return items, rect, close_path

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    rect = PdfRect(min(xs), min(ys), max(xs), max(ys))
    rect.normalize()
    return items, rect, close_path


def extract_path_drawing(obj, page_h: float, rot_m: PdfMatrix) -> Optional[dict[str, Any]]:
    """One pdfium path object -> one drawing dict."""
    try:
        om = _pdfium_matrix_to_ours(obj.get_matrix())
    except Exception:
        om = PdfMatrix()
    try:
        items, rect, close_path = _path_items(obj, om, rot_m, page_h)
    except Exception:
        return None
    fill = ctypes.c_int()
    stroke = ctypes.c_int()
    pdfium_c.FPDFPath_GetDrawMode(obj, ctypes.byref(fill), ctypes.byref(stroke))
    stroke_rgb = _read_color(obj, True) if stroke.value else None
    fill_rgb = _read_color(obj, False) if fill.value else None
    # bounds (more stable than point hull for thin strokes)
    l, b, r, t = ctypes.c_float(), ctypes.c_float(), ctypes.c_float(), ctypes.c_float()
    bounds_rect = rect
    if pdfium_c.FPDFPageObj_GetBounds(obj, l, b, r, t):
        bounds_rect = display_bounds_from_pdf(l.value, b.value, r.value, t.value, page_h)
    if bounds_rect.width > 0 or bounds_rect.height > 0:
        rect = bounds_rect
    area = rect.width * rect.height
    col = stroke_rgb or fill_rgb
    if col and area > 2500:
        mx = max(col)
        mn = min(col)
        if mx - mn < 0.04 and 0.12 <= mx <= 0.92 and fill.value:
            return None
    if not items and (rect.width == 0 and rect.height == 0):
        return None
    return {
        "rect": rect,
        "items": items,
        "color": stroke_rgb,
        "fill": fill_rgb,
        "closePath": close_path,
        "width": 1.0,
        "dashes": "[] 0",
    }


def extract_page_drawings(
    page,
    rotation_deg: int,
    page_w: float,
    page_h: float,
    *,
    budget_sec: float = 120.0,
    progress: Optional[Callable[[int, int], None]] = None,
    batch: int = 8000,
) -> tuple[list[dict[str, Any]], float]:
    """Enumerate path pageobjects and return drawing dicts + seconds elapsed."""
    t0 = time.perf_counter()
    from .geometry import rotation_matrix

    rot_m = rotation_matrix(rotation_deg, page_w, page_h)
    out: list[dict[str, Any]] = []
    n = 0
    for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_PATH]):
        if time.perf_counter() - t0 > budget_sec:
            break
        d = extract_path_drawing(obj, page_h, rot_m)
        if d is not None:
            out.append(d)
        n += 1
        if progress and n % batch == 0:
            progress(n, len(out))
    if progress:
        progress(n, len(out))
    return out, time.perf_counter() - t0


def extract_page_text_chars(
    page, rotation_deg: int, page_w: float, page_h: float
) -> tuple[list[dict[str, Any]], bool]:
    """Per-character boxes in display space (legend row text)."""
    from .heavy_guard import HeavyBudget

    chars: list[dict[str, Any]] = []
    try:
        tp = page.get_textpage()
    except Exception:
        return chars, False
    budget = HeavyBudget.from_env()
    truncated = False
    try:
        n = tp.count_chars()
        n_use = min(n, budget.max_text_chars)
        truncated = n > n_use
        for i in range(n_use):
            try:
                box = tp.get_charbox(i)
            except Exception:
                continue
            if not box or len(box) < 4:
                continue
            l, b, r, t = float(box[0]), float(box[1]), float(box[2]), float(box[3])
            rect = display_bounds_from_pdf(l, b, r, t, page_h)
            ch = tp.get_text_range(i, 1) or ""
            if not ch or ch in ("\u0000",):
                continue
            chars.append(
                {
                    "char": ch,
                    "rect": rect,
                    "cx": (rect.x0 + rect.x1) / 2,
                    "cy": (rect.y0 + rect.y1) / 2,
                    "index": i,
                }
            )
    finally:
        try:
            tp.close()
        except Exception:
            pass
    return chars, truncated


def extract_page_text_words(page, rotation_deg: int, page_w: float, page_h: float) -> list[dict[str, Any]]:
    """Text words with bounds in display space (for legend/scale/tag)."""
    from .geometry import rotation_matrix

    rot_m = rotation_matrix(rotation_deg, page_w, page_h)
    words: list[dict[str, Any]] = []
    try:
        tp = page.get_textpage()
    except Exception:
        return words
    try:
        for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_TEXT]):
            try:
                text = obj.extract().strip()
            except Exception:
                continue
            if not text:
                continue
            try:
                l, b, r, t = obj.get_bounds()
            except Exception:
                continue
            rect = display_bounds_from_pdf(l, b, r, t, page_h)
            cx, cy = (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2
            tx, ty = rot_m.transform_point(cx, page_h - cy)  # already display; identity rot ok
            _ = tx, ty
            words.append({"text": text, "rect": rect, "cx": (rect.x0 + rect.x1) / 2, "cy": (rect.y0 + rect.y1) / 2})
        if not words:
            plain = (tp.get_text_range() or "").replace("\r\n", "\n").strip()
            if plain:
                from .geometry import PdfRect

                rect = PdfRect(0, 0, page_w, min(page_h, 48.0))
                words.append(
                    {
                        "text": plain,
                        "rect": rect,
                        "cx": page_w / 2,
                        "cy": 24.0,
                    }
                )
    finally:
        try:
            tp.close()
        except Exception:
            pass
    return words


def page_vector_stats(page) -> dict[str, int]:
    paths = images = 0
    for obj in page.get_objects():
        if obj.type == pdfium_c.FPDF_PAGEOBJ_PATH:
            paths += 1
        elif obj.type == pdfium_c.FPDF_PAGEOBJ_IMAGE:
            images += 1
    return {"paths": paths, "images": images}