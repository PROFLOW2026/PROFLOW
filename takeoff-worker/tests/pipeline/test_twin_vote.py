from __future__ import annotations

from takeoff_worker.classify.twin_vote import apply_twin_voting
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import WorkerDetection, WorkerLegendEntry


def _pdf(lk: str, twin: str) -> WorkerDetection:
    return WorkerDetection(
        id=f"pdf-{lk}",
        sheetKey="p1",
        fileId="pdf",
        source="pdf",
        x=10,
        y=10,
        signature="shape:x",
        signatureKind="pdf-shape",
        rawClass=lk,
        legendKey=lk,
        typeKey=None,
        classifiedBy="none",
        confidence="none",
        twinId=twin,
    )


def _dwg(block: str, twin: str, tk: str) -> WorkerDetection:
    return WorkerDetection(
        id=f"dwg-{block}",
        sheetKey="p1",
        fileId="dwg",
        source="dwg",
        x=10,
        y=10,
        signature=f"block:{block}",
        signatureKind="dwg-block",
        rawClass=block,
        blockName=block,
        typeKey=tk,
        classifiedBy="dwg_block_map",
        confidence="medium",
        twinId=twin,
    )


def test_twin_voting_maps_legend_key():
    dets = [
        _pdf("L4", "t1"),
        _dwg("T1", "t1", "light.recessed"),
        WorkerDetection(
            id="pdf-L4b",
            sheetKey="p1",
            fileId="pdf",
            source="pdf",
            x=1,
            y=1,
            signature="shape:x",
            signatureKind="pdf-shape",
            rawClass="L4",
            legendKey="L4",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            twinId="t2",
        ),
        _dwg("T1", "t2", "light.recessed"),
        WorkerDetection(
            id="pdf-L4c",
            sheetKey="p1",
            fileId="pdf",
            source="pdf",
            x=2,
            y=2,
            signature="shape:x",
            signatureKind="pdf-shape",
            rawClass="L4",
            legendKey="L4",
            typeKey=None,
            classifiedBy="none",
            confidence="none",
            twinId="t3",
        ),
        _dwg("T1", "t3", "light.recessed"),
    ]
    legend = [WorkerLegendEntry(key="L4", fileId="pdf", signature="s", signatureKind="pdf-shape")]
    out, leg = apply_twin_voting(dets, legend, load_default_catalog())
    pdfs = [d for d in out if d.legendKey == "L4"]
    assert all(d.typeKey == "light.recessed" for d in pdfs)
    assert leg[0].typeKey == "light.recessed"