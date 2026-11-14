"""Hebrew RTL BOQ PDF export."""
from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from takeoff_worker.models import ExportBoqPdfRequest

from .bidi_he import shape_rtl

_FONTS = Path(__file__).parent / "fonts"


def export_boq_pdf(req: ExportBoqPdfRequest) -> bytes:
    buf = io.BytesIO()
    w, h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    fp = _FONTS / "NotoSansHebrew-Regular.ttf"
    if fp.is_file():
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        pdfmetrics.registerFont(TTFont("Heb", str(fp)))
        font = "Heb"
    else:
        font = "Helvetica"
    c.setFont(font, 16)
    c.drawString(20 * mm, h - 25 * mm, shape_rtl(req.title))
    if req.subtitle:
        c.setFont(font, 11)
        c.drawString(20 * mm, h - 32 * mm, shape_rtl(req.subtitle))

    if not req.approved:
        c.saveState()
        c.setFillColor(colors.Color(1, 0, 0, alpha=0.12))
        c.setFont(font, 40)
        c.translate(w / 2, h / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, shape_rtl("טיוטה - לא מאומת"))
        c.restoreState()

    c.setFont(font, 9)
    y = h - 45 * mm
    headers = ["כמות", "יחידה", "תיאור", "קומה", "אזור", "סטטוס"]
    xcols = [20, 35, 55, 130, 155, 175]
    for i, hdr in enumerate(headers):
        c.drawString(xcols[i] * mm, y, shape_rtl(hdr))
    y -= 6 * mm
    c.line(18 * mm, y, w - 18 * mm, y)
    y -= 5 * mm

    for line in req.lines:
        if y < 25 * mm:
            c.showPage()
            y = h - 25 * mm
        c.drawString(xcols[0] * mm, y, f"{line.quantity:g}")
        c.drawString(xcols[1] * mm, y, shape_rtl(line.unit))
        c.drawString(xcols[2] * mm, y, shape_rtl(line.label)[:48])
        c.drawString(xcols[3] * mm, y, shape_rtl(line.floor or "-"))
        c.drawString(xcols[4] * mm, y, shape_rtl(line.area or "-"))
        c.drawString(xcols[5] * mm, y, shape_rtl(line.status))
        y -= 5 * mm

    y -= 5 * mm
    c.setFont(font, 8)
    c.drawString(20 * mm, y, shape_rtl("הגבלות / Limitations"))
    y -= 4 * mm
    for lim in req.limitations[:12]:
        c.drawString(22 * mm, y, shape_rtl(f"• {lim}"))
        y -= 4 * mm

    c.showPage()
    c.save()
    return buf.getvalue()