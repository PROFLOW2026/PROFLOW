from __future__ import annotations

import numpy as np

from takeoff_worker.merge.align import apply, fit_similarity
from takeoff_worker.merge.pdf_dwg import merge_pdf_dwg_pair
from takeoff_worker.models import SheetScale, WorkerDetection, WorkerSheet


def _det(i: int, x: float, y: float, source: str, raw: str) -> WorkerDetection:
    return WorkerDetection(
        id=f"{source}#{i}",
        sheetKey="p1",
        fileId="pdf" if source == "pdf" else "dwg",
        source=source,  # type: ignore[arg-type]
        x=x,
        y=y,
        signature=f"block:{raw}",
        signatureKind="dwg-block",
        rawClass=raw,
        blockName=raw,
        typeKey="power.socket.single",
        classifiedBy="none",
        confidence="medium",
    )


def test_merge_same_coords_pairs():
    sheet = WorkerSheet(
        sheetKey="p1",
        fileId="pdf",
        name="plan",
        kind="pdf_page",
        index=0,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    pdf = [_det(i, 100 + i * 5, 100, "pdf", "S") for i in range(4)]
    dwg = [_det(i, 100 + i * 5, 100, "dwg", "S") for i in range(4)]
    merged, _, stats = merge_pdf_dwg_pair(pdf, dwg, sheet)
    assert stats["merge_matched_pairs"] == 4
    twins = [d for d in merged if d.twinId]
    assert len(twins) == 8
    assert all("pdf_dwg_mismatch" not in d.reasons for d in merged)


def test_merge_type_conflict_prefers_dwg_type():
    sheet = WorkerSheet(
        sheetKey="p1",
        fileId="pdf",
        name="plan",
        kind="pdf_page",
        index=0,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    pdf = [
        WorkerDetection(
            id="p1",
            sheetKey="p1",
            fileId="pdf",
            source="pdf",
            x=100,
            y=100,
            signature="s",
            signatureKind="pdf-shape",
            rawClass="A",
            typeKey="lighting.a",
            classifiedBy="none",
            confidence="high",
        )
    ]
    dwg = [
        WorkerDetection(
            id="d1",
            sheetKey="p1",
            fileId="dwg",
            source="dwg",
            x=100,
            y=100,
            signature="block:B",
            signatureKind="dwg-block",
            rawClass="B",
            blockName="B",
            typeKey="power.socket.single",
            classifiedBy="library",
            confidence="high",
        )
    ]
    merged, _, _ = merge_pdf_dwg_pair(pdf, dwg, sheet)
    twins = [d for d in merged if d.twinId]
    assert all(d.typeKey == "power.socket.single" for d in twins)
    assert all("type_ambiguous" in d.reasons for d in twins)


def test_umeyama_fit_recovers_translation():
    P = np.array([[0, 0], [10, 0], [0, 10]], float)
    Q = P + np.array([5, -3])
    fit = fit_similarity(P, Q, tol=1.0)
    assert fit is not None
    sc, R, t, score = fit
    X = apply(P, sc, R, t)
    assert np.max(np.linalg.norm(X - Q, axis=1)) < 1.5
    assert score >= 3