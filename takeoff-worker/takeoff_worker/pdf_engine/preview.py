"""Page preview rasterization via pypdfium2."""
from __future__ import annotations

import io

import pypdfium2 as pdfium
from PIL import Image


def render_page_png(page, max_edge: int) -> tuple[bytes, int, int, float]:
    """Return PNG bytes, widthPx, heightPx, scale (preview px per PDF point).

    pdfium ``get_width`` / ``get_height`` are already the rotated view, and
    ``page.render`` draws that same view. Do not swap the edges again.
    """
    pw, ph = page.get_width(), page.get_height()
    scale = max_edge / max(pw, ph)
    bitmap = page.render(scale=scale, rotation=0)
    pil = bitmap.to_pil()
    w_px, h_px = pil.size
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return buf.getvalue(), w_px, h_px, scale