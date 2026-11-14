from __future__ import annotations

from takeoff_worker.classify.confidence import calibrate_confidences
from takeoff_worker.models import WorkerDetection, WorkerLegendEntry


def test_high_requires_library_or_strong_signals():
    weak = WorkerDetection(
        id="1",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=1,
        y=1,
        signature="shape:a",
        signatureKind="pdf-shape",
        rawClass="L1",
        legendKey="L1",
        typeKey="light.recessed",
        classifiedBy="legend_text",
        confidence="high",
    )
    out = calibrate_confidences([weak], [])
    assert out[0].confidence != "high"

    strong = weak.model_copy(
        deep=True,
        update={
            "twinId": "twin-1",
            "score": 0.1,
            "margin": 0.5,
        },
    )
    legend = [
        WorkerLegendEntry(
            key="L1",
            fileId="f",
            signature="s",
            signatureKind="pdf-shape",
            typeKey="light.recessed",
            confidence="medium",
        )
    ]
    out2 = calibrate_confidences([strong], legend)
    assert out2[0].confidence == "high"