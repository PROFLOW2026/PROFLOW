"""Read X2 multiplier notes drawn on the sheet.

The text layer of a plotted PDF is often empty. The note is still ink, so
this reads word boxes from a render of the page and returns them in display
space (origin top-left, y down). It does not decide which symbol the note
belongs to.
"""
from __future__ import annotations

import io

from .legend_ocr import recognize_png_words


def note_crop_radius(extent: float) -> float:
    """Radius, in display points, of the crop that looks for a multiplier note.

    The note is a short Latin word beside the symbol. A crop that only covers
    the ink is still too small for the reader to separate that word, and a crop
    the size of the room merges the note into the circuit number. The window
    is several symbol sizes, at least an inch and a third, and at most about
    an inch and two thirds. Which symbol receives the note is decided later.
    """
    size = extent if extent > 0 else 8.0
    return min(120.0, max(8.0 * size, 96.0))


def read_symbol_words(
    page,
    page_w: float,
    page_h: float,
    symbols: list[tuple[float, float, float]],
) -> list[tuple[str, float, float]]:
    """OCR around each symbol. Words are in display points.

    The crop is large enough to separate a short note from the symbol.
    The language is English because the note is ``X2``, and Hebrew mode
    rewrites that token. An empty list means that crop was not read.
    """
    if page_w <= 0 or page_h <= 0:
        return []
    scale = 5.0
    words: list[tuple[str, float, float]] = []
    for cx, cy, extent in symbols:
        radius = note_crop_radius(extent)
        x0 = max(0.0, cx - radius)
        y0 = max(0.0, cy - radius)
        x1 = min(page_w, cx + radius)
        y1 = min(page_h, cy + radius)
        if x1 - x0 < 4.0 or y1 - y0 < 4.0:
            continue
        try:
            rendered = page.render(
                scale=scale,
                rotation=0,
                crop=(x0, page_h - y1, page_w - x1, y0),
            )
            image = rendered.to_pil().convert("L")
        except Exception:
            continue
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        for text, px, py in recognize_png_words(buffer.getvalue(), lang="eng"):
            words.append((text, x0 + px / scale, y0 + py / scale))
    return words


def read_page_words(page, page_w: float, page_h: float) -> list[tuple[str, float, float]]:
    """OCR the page in horizontal bands. Each word is ``(text, x, y)`` in display points.

    An empty list means OCR did not read the page. Callers must not invent a
    multiplier from that.
    """
    if page_w <= 0 or page_h <= 0:
        return []
    scale = 2.0
    words: list[tuple[str, float, float]] = []
    bands = 4
    for index in range(bands):
        y0 = page_h * index / bands
        y1 = page_h * (index + 1) / bands
        try:
            rendered = page.render(
                scale=scale,
                rotation=0,
                crop=(0.0, page_h - y1, 0.0, y0),
            )
            image = rendered.to_pil().convert("RGB")
        except Exception:
            continue
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        for text, px, py in recognize_png_words(buffer.getvalue()):
            words.append((text, px / scale, y0 + py / scale))
    return words
