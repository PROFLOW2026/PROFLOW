from __future__ import annotations

from takeoff_worker.merge.unpaired import apply_unpaired_pdf_policy
from takeoff_worker.models import WorkerDetection, WorkerFile


def _det(det_id: str, *, source: str, file_id: str, reasons: list | None = None) -> WorkerDetection:
    return WorkerDetection(
        id=det_id,
        sheetKey="p1",
        fileId=file_id,
        source=source,
        x=0,
        y=0,
        signature="s",
        signatureKind="pdf-shape" if source == "pdf" else "dwg-block",
        rawClass="x",
        reasons=reasons or [],
    )


def test_unpaired_pdf_gets_pdf_only_when_dwg_present():
    dets = [
        _det("p", source="pdf", file_id="plan"),
        _det("d", source="dwg", file_id="dwg1"),
    ]
    files = [
        WorkerFile(fileId="plan", name="plan.pdf", kind="pdf", sizeBytes=1, downloadUrl="x"),
        WorkerFile(fileId="dwg1", name="a.dwg", kind="dwg", sizeBytes=1, downloadUrl="x"),
    ]
    tagged, warnings = apply_unpaired_pdf_policy(dets, files)
    assert tagged == 1
    assert "pdf_only" in dets[0].reasons
    assert warnings and warnings[0].code == "pdf_dwg_unpaired"


def test_legend_pdf_file_not_tagged():
    dets = [_det("p", source="pdf", file_id="legend")]
    files = [
        WorkerFile(fileId="legend", name="7155-A1-מקרא.pdf", kind="pdf", sizeBytes=1, downloadUrl="x"),
        WorkerFile(fileId="dwg1", name="a.dwg", kind="dwg", sizeBytes=1, downloadUrl="x"),
    ]
    tagged, _ = apply_unpaired_pdf_policy(dets, files)
    assert tagged == 0
    assert "pdf_only" not in dets[0].reasons