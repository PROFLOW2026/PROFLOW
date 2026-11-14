"""Synthetic vector PDF detection tests (reportlab)."""
from __future__ import annotations

import io

import pytest
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine


def _synthetic_pdf(tmp_path) -> str:
    p = tmp_path / "synth.pdf"
    c = canvas.Canvas(str(p), pagesize=A4)
    w, h = A4
    # red circle
    c.setFillColor(colors.red)
    c.circle(120, h - 150, 12, stroke=0, fill=1)
    # blue square
    c.setFillColor(colors.blue)
    c.rect(220, h - 170, 24, 24, stroke=0, fill=1)
    # green triangle
    c.setFillColor(colors.green)
    pth = c.beginPath()
    pth.moveTo(340, h - 150)
    pth.lineTo(360, h - 150)
    pth.lineTo(350, h - 125)
    pth.close()
    c.drawPath(pth, stroke=0, fill=1)
    c.drawString(40, h - 40, "1:100 test scale")
    c.save()
    return str(p)


def test_synthetic_coloured_symbols(tmp_path):
    path = _synthetic_pdf(tmp_path)
    eng = PdfVectorEngine()
    out = eng.analyze(path, "f1", options=JobOptions(previewMaxEdgePx=2000, renderPreview=False), library=[])
    assert out.sheets and out.sheets[0].analyzed == "full"
    assert len(out.detections) >= 2
    assert out.sheets[0].scale.ratio == 100