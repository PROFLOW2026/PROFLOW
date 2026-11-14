from __future__ import annotations

from takeoff_worker.merge.sheet_pair import layout_hint_from_pdf_filename, pick_dwg_sheet_for_pdf
from takeoff_worker.models import SheetScale, WorkerSheet


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