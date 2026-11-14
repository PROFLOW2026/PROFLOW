"""Legend char-box text + contract fields."""
from __future__ import annotations

from takeoff_worker.models import LegendTextBox, WorkerLegendEntry


def test_worker_legend_entry_text_box_and_reasons():
    row = WorkerLegendEntry(
        key="L1",
        fileId="f",
        rawText="abc",
        decodedText="cba",
        decodedBy="pdf_text",
        textBox=LegendTextBox(x0=1, y0=2, x1=10, y1=12),
        reasons=["legend_text_undecodable"],
        signature="s",
        signatureKind="pdf-shape",
    )
    assert row.textBox is not None
    assert row.reasons == ["legend_text_undecodable"]