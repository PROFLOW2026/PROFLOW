from takeoff_worker.models import WorkerDetection


def test_legend_zone_reason_allowed():
    d = WorkerDetection(
        id="p1#1",
        sheetKey="p1",
        fileId="f",
        source="pdf",
        x=1,
        y=1,
        signature="shape:x",
        signatureKind="pdf-shape",
        rawClass="legend_margin",
        confidence="none",
        reasons=["legend_zone"],
    )
    assert "legend_zone" in d.reasons