from __future__ import annotations

from takeoff_worker.merge.sheet_pair import (
    _quick_align_pairs,
    layout_hint_from_pdf_filename,
    pick_dwg_sheet_for_pdf,
)
from takeoff_worker.models import SheetScale, WorkerDetection, WorkerSheet


def test_layout_hint_from_hebrew_filename():
    assert layout_hint_from_pdf_filename("7155-A1-חשמל ג.pdf") == "חשמל ג"
    assert layout_hint_from_pdf_filename("7155-A1-תאורה ד.pdf") == "תאורה ד"


def test_name_pairing_prefers_matching_layout():
    pdf_sheet = WorkerSheet(
        sheetKey="p1",
        fileId="pdf",
        name="plan",
        kind="pdf_page",
        index=0,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    sheets = [
        WorkerSheet(
            sheetKey="layout:תאורה ג",
            fileId="dwg",
            name="תאורה ג",
            kind="dwg_layout",
            index=0,
            widthPx=100,
            heightPx=100,
            scale=SheetScale(verified=True, source="none"),
        ),
        WorkerSheet(
            sheetKey="layout:חשמל ג",
            fileId="dwg",
            name="חשמל ג",
            kind="dwg_layout",
            index=1,
            widthPx=100,
            heightPx=100,
            scale=SheetScale(verified=True, source="none"),
        ),
    ]
    picked, how = pick_dwg_sheet_for_pdf(pdf_sheet, sheets, pdf_file_name="7155-A1-חשמל ג.pdf")
    assert picked is not None
    assert picked.name == "חשמל ג"
    assert how in ("filename_exact", "filename")


def _det(i: int, sheet_key: str, file_id: str, source: str, x: float, y: float, raw: str) -> WorkerDetection:
    return WorkerDetection(
        id=f"{source}-{i}",
        sheetKey=sheet_key,
        fileId=file_id,
        source=source,  # type: ignore[arg-type]
        x=x,
        y=y,
        signature=f"{raw}-{i}",
        signatureKind="dwg-block" if source == "dwg" else "pdf-shape",
        rawClass=raw,
        blockName=raw,
    )


def test_content_pairing_picks_geometrically_matching_layout():
    pdf_sheet = WorkerSheet(
        sheetKey="p1",
        fileId="pdf",
        name="plan",
        kind="pdf_page",
        index=0,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    match = WorkerSheet(
        sheetKey="layout:match",
        fileId="dwg",
        name="layout A",
        kind="dwg_layout",
        index=0,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    other = WorkerSheet(
        sheetKey="layout:other",
        fileId="dwg",
        name="layout B",
        kind="dwg_layout",
        index=1,
        widthPx=1000,
        heightPx=1000,
        scale=SheetScale(verified=True, source="none"),
    )
    points = [(80 + 80 * i, 90 + 70 * (i % 4)) for i in range(12)]
    pdf_dets = [_det(i, "p1", "pdf", "pdf", x, y, f"L{i % 3}") for i, (x, y) in enumerate(points)]
    match_dets = [_det(i, match.sheetKey, "dwg", "dwg", x, y, f"L{i % 3}") for i, (x, y) in enumerate(points)]
    other_dets = [
        _det(i, other.sheetKey, "dwg", "dwg", 800 - 10 * i, 820 - 12 * i, f"L{i % 3}") for i in range(12)
    ]
    match_pairs = _quick_align_pairs(pdf_dets, match_dets, pdf_sheet, match)
    other_pairs = _quick_align_pairs(pdf_dets, other_dets, pdf_sheet, other)
    picked, how = pick_dwg_sheet_for_pdf(
        pdf_sheet,
        [other, match],
        pdf_file_name="sheet.pdf",
        pdf_detections=pdf_dets,
        dwg_detections_by_sheet={match.sheetKey: match_dets, other.sheetKey: other_dets},
    )
    assert match_pairs >= 8
    assert match_pairs > other_pairs + 8
    assert other_pairs == 0 or other_pairs < 3
    assert how == "content"
    assert picked is not None
    assert picked.sheetKey == match.sheetKey