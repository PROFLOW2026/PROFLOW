"""Embedded legend row -> plan detection legendKey (PDF-only path)."""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine


def _embedded_legend_pdf(path) -> None:
    w, h = A4
    c = canvas.Canvas(str(path), pagesize=A4)
    # Plan field — repeated red circles
    for row in range(4):
        for col in range(5):
            c.setFillColor(colors.red)
            c.circle(80 + col * 55, h - 120 - row * 70, 9, stroke=0, fill=1)
    # Right margin legend rows (symbol + Hebrew label)
    labels = [
        "SOCKET",
        "SWITCH",
        "LIGHT",
        "FIRE",
        "PANEL",
        "SOCKET",
        "SWITCH",
        "LIGHT",
        "FIRE",
        "PANEL",
    ]
    for i, label in enumerate(labels):
        y = h - 85 - i * 48
        c.setFillColor(colors.red)
        c.circle(w - 75, y, 9, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 11)
        c.drawRightString(w - 45, y - 4, label)
    c.save()


def test_embedded_legend_links_legend_key_and_catalog(tmp_path):
    pdf = tmp_path / "embed.pdf"
    _embedded_legend_pdf(pdf)
    out = PdfVectorEngine().analyze(str(pdf), "f1", options=JobOptions(renderPreview=False), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    with_key = [d for d in plan if d.legendKey]
    assert out.stats.get("legend_rows_decodable_p1", 0) >= 3
    assert len(with_key) >= 8
    assert all(d.legendKey for d in with_key)
    # Catalog typing needs Hebrew keywords (Latin test labels stay legend_unmapped).
    legend_by_key = {r.key: r for r in legend}
    assert any(legend_by_key[d.legendKey].decodedText for d in with_key if d.legendKey)