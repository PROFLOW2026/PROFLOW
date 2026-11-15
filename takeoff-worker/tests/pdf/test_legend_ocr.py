"""Hebrew legend OCR: real catalog matches, and a manual group when OCR cannot read."""
from __future__ import annotations

from types import SimpleNamespace

from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.classify.pipeline_classify import classify_legend_entries
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.models import WorkerLegendEntry
from takeoff_worker.pdf_engine.geometry import PdfRect, media_size_from_view, rotation_matrix
from takeoff_worker.pdf_engine.legend import plan_template_pairs
from takeoff_worker.pdf_engine import legend_ocr
from takeoff_worker.pdf_engine.legend_ocr import (
    enrich_legend_rows,
    legend_text_needs_ocr,
    text_from_ocr,
)


def test_rotated_view_size_is_not_swapped_twice():
    """pdfium get_width/height are the viewer size. 270° media is the swap of that."""
    assert media_size_from_view(0, 100, 200) == (100, 200)
    assert media_size_from_view(270, 3370, 2384) == (2384, 3370)
    matrix = rotation_matrix(270, 2384, 3370)
    x, y = matrix.transform_point(826.52, 1419.44)
    assert abs(x - 1419.44) < 0.05
    assert abs(y - (2384 - 826.52)) < 0.05


def test_needs_ocr_only_when_hebrew_is_unusable():
    assert legend_text_needs_ocr(None, [])
    assert legend_text_needs_ocr("", [])
    assert legend_text_needs_ocr("שקע כוח", []) is False
    assert legend_text_needs_ocr("עקש", []) is True
    assert legend_text_needs_ocr("SOCKET", []) is False
    assert legend_text_needs_ocr("PRODUCED BY AN AUTODESK EDUCATIONAL PRODUCT", []) is True
    assert legend_text_needs_ocr("שקע", ["legend_text_undecodable"]) is True


def test_ocr_hebrew_goes_through_decode_and_catalog():
    catalog = load_default_catalog()
    for raw, type_key in (
        ("מפסק יחיד", "control.switch.single"),
        ("שקע כוח", "power.outlet.commercial"),
        ("חוכ עקש", "power.outlet.commercial"),
        ("גוף תאורה שקוע", "light.recessed"),
    ):
        stored = text_from_ocr(raw)
        match = match_legend_text(stored, catalog)
        assert match is not None, raw
        assert match.type_key == type_key


def test_ocr_match_labels_row_failed_ocr_stays_untyped():
    catalog = load_default_catalog()
    ok = WorkerLegendEntry(
        key="L1",
        fileId="f",
        signature="shape:socket",
        signatureKind="pdf-shape",
        decodedText=None,
        decodedBy="none",
        reasons=["legend_text_undecodable"],
    )
    bad = WorkerLegendEntry(
        key="L2",
        fileId="f",
        signature="shape:unknown",
        signatureKind="pdf-shape",
        decodedText=None,
        decodedBy="none",
        reasons=["legend_text_undecodable"],
    )
    answers = {0: "שקע כוח", 1: ""}

    def _reader(png: bytes) -> str:
        value = answers[_reader.n]
        _reader.n += 1
        return value

    _reader.n = 0
    comps = [SimpleNamespace(rect=PdfRect(0, 0, 10, 10)), SimpleNamespace(rect=PdfRect(0, 20, 10, 30))]
    report = enrich_legend_rows(
        [ok, bad],
        page=None,
        comps=comps,
        view_w=100,
        view_h=100,
        recognize=_reader,
        crop_fn=lambda *_a, **_k: b"png",
    )
    assert report.ran is True
    assert report.applied == 1
    legend = classify_legend_entries([ok, bad], catalog)
    assert legend[0].typeKey == "power.outlet.commercial"
    assert legend[0].confidence in ("low", "medium", "high")
    assert legend[1].typeKey is None
    assert legend[1].confidence == "none"
    assert legend[1].signature == "shape:unknown"
    assert legend[1].key == "L2"
    pairs, _n = plan_template_pairs(legend, comps)
    assert [key for key, _comp in pairs] == ["L1", "L2"]


def test_left_label_band_covers_a_long_legend_line():
    comp = SimpleNamespace(rect=PdfRect(2300, 500, 2320, 518))
    x0, _y0, x1, _y1 = legend_ocr._band_rect(comp, 3370, 2384, side="left", half=10)
    assert x1 <= 2300
    assert x1 - x0 >= 480


def test_row_band_stops_short_of_the_next_symbol():
    a = SimpleNamespace(rect=PdfRect(2300, 500, 2318, 516))
    b = SimpleNamespace(rect=PdfRect(2300, 524, 2318, 540))
    half = legend_ocr._row_half_pt(a, [a, b])
    assert 10 <= half <= 14


def test_unmatched_ocr_hebrew_does_not_invent_a_type():
    catalog = load_default_catalog()
    row = WorkerLegendEntry(
        key="L3",
        fileId="f",
        signature="shape:note",
        signatureKind="pdf-shape",
        decodedText=None,
        decodedBy="none",
        reasons=["legend_text_undecodable"],
    )

    def _reader(_png: bytes) -> str:
        return "הערת מתכנן בלבד"

    report = enrich_legend_rows(
        [row],
        page=None,
        comps=[SimpleNamespace(rect=PdfRect(0, 0, 12, 12))],
        view_w=80,
        view_h=80,
        recognize=_reader,
        crop_fn=lambda *_a, **_k: b"png",
    )
    assert report.ran is True
    assert report.applied == 1
    assert row.decodedText
    legend = classify_legend_entries([row], catalog)
    assert legend[0].typeKey is None
    assert legend[0].confidence == "none"
    assert "legend_text_undecodable" in (legend[0].reasons or [])


def test_missing_ocr_engine_does_not_invent_text(monkeypatch):
    monkeypatch.setattr(legend_ocr, "active_ocr_backend", lambda: "none")
    row = WorkerLegendEntry(
        key="L9",
        fileId="f",
        signature="shape:keep",
        signatureKind="pdf-shape",
        decodedText=None,
        decodedBy="none",
        reasons=["legend_text_undecodable"],
    )
    report = enrich_legend_rows(
        [row],
        page=object(),
        comps=[SimpleNamespace(rect=PdfRect(0, 0, 8, 8))],
        view_w=10,
        view_h=10,
    )
    assert report.ran is False
    assert report.backend == "none"
    assert row.decodedText is None
    assert row.typeKey is None
    assert "legend_text_undecodable" in row.reasons
