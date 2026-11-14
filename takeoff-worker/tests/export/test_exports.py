from __future__ import annotations

from pathlib import Path

from takeoff_worker.export.annotated_pdf import export_annotated_pdf
from takeoff_worker.export.boq_pdf import export_boq_pdf
from takeoff_worker.models import (
    BoqPdfLine,
    ExportAnnotatedPdfRequest,
    ExportBoqPdfRequest,
    ExportDetection,
    TypeStyle,
    WorkerFile,
    WorkerSheet,
)


def test_boq_pdf_bytes(tmp_path):
    pdf = export_boq_pdf(
        ExportBoqPdfRequest(
            title="כתב כמויות בדיקה",
            approved=False,
            generatedAtIso="2026-11-14T00:00:00Z",
            limitations=["בדיקה בלבד"],
            lines=[BoqPdfLine(label="גוף תאורה טרנזית", category="lighting", unit="יח'", quantity=12, status="טיוטה")],
        )
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1200


def test_annotated_pdf_overlay(tmp_path):
    # minimal pdf via reportlab
    from reportlab.pdfgen import canvas

    src = tmp_path / "src.pdf"
    c = canvas.Canvas(str(src))
    c.drawString(40, 800, "plan")
    c.save()
    data = export_annotated_pdf(
        ExportAnnotatedPdfRequest(
            file=WorkerFile(fileId="f", name="src.pdf", kind="pdf", sizeBytes=1, downloadUrl=""),
            sheet=WorkerSheet(
                sheetKey="p1",
                fileId="f",
                name="p1",
                kind="pdf_page",
                index=0,
                widthPx=800,
                heightPx=600,
                analyzed="full",
            ),
            detections=[ExportDetection(id="p1#1", x=100, y=100, w=20, h=20, typeKey="light", confidence="high")],
            styles=[TypeStyle(typeKey="light", label="Light", colorHex="#ef4444")],
            title="בדיקה",
        ),
        str(src),
    )
    assert data[:4] == b"%PDF"
    assert Path(__file__).parent.parent.parent.joinpath("takeoff_worker/export/fonts/NotoSansHebrew-Regular.ttf").is_file()