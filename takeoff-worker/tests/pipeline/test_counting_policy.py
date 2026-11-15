from __future__ import annotations

from takeoff_worker.classify.counting_policy import boq_count_summary, is_countable
from takeoff_worker.models import WorkerDetection


def test_pdf_only_not_countable():
    d = WorkerDetection(
        id="p1",
        sheetKey="s",
        fileId="f",
        source="pdf",
        x=1,
        y=1,
        signature="x",
        signatureKind="pdf-shape",
        rawClass="L1",
        typeKey="light.recessed",
        classifiedBy="legend_text",
        confidence="medium",
        reasons=["pdf_only"],
    )
    assert not is_countable(d)


def test_drawing_noise_excluded_from_boq():
    d = WorkerDetection(
        id="n",
        sheetKey="s",
        fileId="f",
        source="pdf",
        x=1,
        y=1,
        signature="x",
        signatureKind="pdf-shape",
        rawClass="scrap",
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        reasons=["drawing_noise"],
    )
    assert not is_countable(d)
    s = boq_count_summary([d])
    assert s["boq_countable"] == 0.0
    assert s["boq_excluded_drawing_noise"] == 1.0


def test_twin_dedupe_in_summary():
    dets = [
        WorkerDetection(
            id="p",
            sheetKey="s",
            fileId="f",
            source="pdf",
            x=1,
            y=1,
            signature="x",
            signatureKind="pdf-shape",
            rawClass="L1",
            typeKey="light.recessed",
            classifiedBy="legend_text",
            confidence="medium",
            twinId="t",
        ),
        WorkerDetection(
            id="d",
            sheetKey="s",
            fileId="f",
            source="dwg",
            x=1,
            y=1,
            signature="block:t1",
            signatureKind="dwg-block",
            rawClass="T1",
            blockName="T1",
            typeKey="light.recessed",
            classifiedBy="dwg_block_map",
            confidence="medium",
            twinId="t",
        ),
        WorkerDetection(
            id="u",
            sheetKey="s",
            fileId="f",
            source="pdf",
            x=2,
            y=2,
            signature="y",
            signatureKind="pdf-shape",
            rawClass="L2",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            reasons=["pdf_only"],
        ),
    ]
    s = boq_count_summary(dets)
    assert s["boq_countable"] == 1.0
    assert s["boq_excluded_pdf_only"] == 1.0