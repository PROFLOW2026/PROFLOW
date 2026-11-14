"""PyMuPDF oracle parity (dev dependency only)."""
from __future__ import annotations

import glob
import os

import pytest

pymupdf = pytest.importorskip("pymupdf")
import pypdfium2 as pdfium

from takeoff_worker.pdf_engine.pdfium_extract import extract_page_drawings


def _find_7155_light_g():
    base = os.path.expanduser(r"~\Downloads")
    hits = glob.glob(base + r"\FW__*\*\*\7155-A1-תאורה ג.pdf")
    return hits[0] if hits else None


@pytest.mark.skipif(_find_7155_light_g() is None, reason="corpus missing")
def test_drawing_count_parity():
    path = _find_7155_light_g()
    doc_p = pdfium.PdfDocument(path)
    page = doc_p[0]
    dr, _ = extract_page_drawings(page, page.get_rotation(), page.get_width(), page.get_height())
    doc_p.close()

    d = pymupdf.open(path)
    pg = d[0]
    dr_m = pg.get_drawings()
    d.close()
    ratio = len(dr) / max(len(dr_m), 1)
    assert 0.97 <= ratio <= 1.05, f"pdfium={len(dr)} pymupdf={len(dr_m)}"


@pytest.mark.skipif(_find_7155_light_g() is None, reason="corpus missing")
def test_bbox_parity_sample():
    path = _find_7155_light_g()
    doc_p = pdfium.PdfDocument(path)
    page = doc_p[0]
    dr, _ = extract_page_drawings(page, page.get_rotation(), page.get_width(), page.get_height())
    doc_p.close()
    d = pymupdf.open(path)
    pg = d[0]
    dr_m = pg.get_drawings()
    d.close()
    for i in range(20):
        r = dr[i]["rect"]
        rm = dr_m[i]["rect"]
        assert abs(r.x0 - rm.x0) < 0.5
        assert abs(r.y0 - rm.y0) < 0.5