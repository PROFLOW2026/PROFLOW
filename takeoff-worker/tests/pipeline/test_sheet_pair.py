from takeoff_worker.merge.sheet_pair import match_dwg_sheet_for_pdf
from takeoff_worker.models import SheetScale, WorkerSheet


def test_match_layout_by_pdf_filename():
    pdf = WorkerSheet(
        sheetKey="p1",
        fileId="lightg",
        name="p1",
        kind="pdf_page",
        index=0,
        widthPx=100,
        heightPx=100,
        scale=SheetScale(verified=False, source="none"),
    )
    dwg_sheets = [
        WorkerSheet(sheetKey="layout:a", fileId="d", name="חשמל ג", kind="dwg_layout", index=0, widthPx=1, heightPx=1, scale=SheetScale()),
        WorkerSheet(sheetKey="layout:b", fileId="d", name="תאורה ג", kind="dwg_layout", index=1, widthPx=1, heightPx=1, scale=SheetScale()),
    ]
    hit = match_dwg_sheet_for_pdf(pdf, dwg_sheets, pdf_file_name="7155-A1-תאורה ג.pdf")
    assert hit is not None
    assert hit.name == "תאורה ג"