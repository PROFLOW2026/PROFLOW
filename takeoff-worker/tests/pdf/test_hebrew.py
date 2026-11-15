"""PDF Hebrew visual-order decode (real letters, not mojibake)."""
from __future__ import annotations

from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.pdf_engine.hebrew import decode_pdf_text


def test_visual_sheket_koach_decodes_and_matches_catalog():
    catalog = load_default_catalog()
    for visual in ("עקש חוכ", "חוכ עקש"):
        decoded = decode_pdf_text(visual)
        assert "שקע" in decoded
        assert "כוח" in decoded
        m = match_legend_text(decoded, catalog)
        assert m is not None
        assert m.type_key == "power.outlet.commercial"


def test_logical_hebrew_left_unchanged():
    raw = "תאורה 3 מנורות LED 220V"
    decoded = decode_pdf_text(raw)
    assert decoded.startswith("תאורה")
    assert "מנורות" in decoded
    assert "LED" in decoded
    assert "220V" in decoded


def test_single_word_visual_sheket():
    assert decode_pdf_text("עקש") == "שקע"


def test_visual_taora_word():
    assert decode_pdf_text("הרואת") == "תאורה"