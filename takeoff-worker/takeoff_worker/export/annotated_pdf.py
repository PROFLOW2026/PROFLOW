"""Annotated plan PDF export (vector overlay via reportlab + pypdf)."""
from __future__ import annotations

import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from takeoff_worker.models import ExportAnnotatedPdfRequest

from .bidi_he import shape_rtl

_FONTS = Path(__file__).parent / "fonts"


def _font_path() -> Path | None:
    p = _FONTS / "NotoSansHebrew-Regular.ttf"
    return p if p.is_file() else None


def export_annotated_pdf(req: ExportAnnotatedPdfRequest, source_path: str) -> bytes:
    """Overlay coloured boxes on the original PDF page (or PNG background for raster sheets)."""
    reader = PdfReader(source_path)
    page_index = max(0, req.sheet.index)
    if page_index >= len(reader.pages):
        page_index = 0
    writer = PdfWriter(clone_from=reader)
    src_page = writer.pages[page_index]
    mediabox = src_page.mediabox
    pw, ph = float(mediabox.width), float(mediabox.height)

    overlay_buf = io.BytesIO()
    c = canvas.Canvas(overlay_buf, pagesize=(pw, ph))
    fp = _font_path()
    if fp:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        pdfmetrics.registerFont(TTFont("Heb", str(fp)))
        c.setFont("Heb", 10)
    else:
        c.setFont("Helvetica", 10)

    c.setFillColor(colors.HexColor("#111827"))
    c.drawString(18, ph - 22, shape_rtl(req.title[:120]))

    style_by_key = {s.typeKey: s for s in req.styles}
    for det in req.detections:
        st = style_by_key.get(det.typeKey)
        col = colors.HexColor(st.colorHex if st else "#dc2626")
        c.setStrokeColor(col)
        c.setLineWidth(1.2)
        x0 = det.x - det.w / 2
        y0 = ph - (det.y + det.h / 2)
        c.rect(x0, y0, det.w, det.h, stroke=1, fill=0)
        c.setFont("Helvetica", 6)
        c.drawString(x0, y0 + det.h + 2, det.id[-8:])

    y = ph - 40
    c.setFont("Helvetica", 8)
    c.drawString(18, y, "Legend / summary")
    y -= 12
    for row in req.boqSummary[:15]:
        c.drawString(24, y, f"{shape_rtl(row.label)}: {row.quantity:g} {row.unit}")
        y -= 10

    c.showPage()
    c.save()
    overlay_buf.seek(0)

    overlay_reader = PdfReader(overlay_buf)
    overlay_page = overlay_reader.pages[0]
    src_page.merge_page(overlay_page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()