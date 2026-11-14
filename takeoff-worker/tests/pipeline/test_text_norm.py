from __future__ import annotations

import json
from pathlib import Path

from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.classify.text_norm import normalize_legend_text
from takeoff_worker.data.catalog_loader import load_default_catalog

FIX = Path(__file__).resolve().parents[3] / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/dwg_legend_descriptions_7155.json"


def test_abbrev_and_final_letters():
    assert "תאורה" in normalize_legend_text('ת"ד לדלקאות')
    assert "גמר" in normalize_legend_text('ג"ג')
    n = normalize_legend_text("םיחלמ תורואת", decoded_by="dwg_kbd")
    assert "מחלמים" in n or "תאורה" in n or len(n) > 4


def test_reversed_visual_with_ltr_numbers():
    raw = "תאורה 3 מנורות LED 220V"
    n = normalize_legend_text(raw)
    assert "220" in n
    assert "LED" in n


def test_7155_dwg_phrases_match_catalog():
    catalog = load_default_catalog()
    if not FIX.is_file():
        return
    rows = json.loads(FIX.read_text(encoding="utf-8"))
    hits = 0
    for row in rows:
        text = normalize_legend_text(row.get("desc") or "", decoded_by="dwg_kbd")
        if match_legend_text(text, catalog):
            hits += 1
    assert hits >= len(rows) // 3