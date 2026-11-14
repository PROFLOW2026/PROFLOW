"""Corpus tests (skip when 7155-A1.dwg absent). Ground truth: phase2/outputs/dwg_deep.json"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from takeoff_worker.dwg_engine.engine import DwgEngine, corpus_7155_path
from takeoff_worker.models import JobOptions

REPO = Path(__file__).resolve().parents[3]
DEEP = REPO / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/dwg_deep.json"

EXPECT = {
    "תאורה ג": (219, 51),
    "תאורה ד": (92, 29),
    "חשמל ג": (51, 219),
    "חשמל ד": (29, 92),
    "לוחות": (24, 0),
}


@pytest.fixture(scope="module")
def dwg_path():
    p = corpus_7155_path()
    if not p or not Path(p).is_file():
        pytest.skip("7155-A1.dwg corpus not on this machine")
    return p


@pytest.fixture(scope="module")
def engine_result(dwg_path):
    eng = DwgEngine()
    return eng.analyze(
        dwg_path,
        "7155",
        kind="dwg",
        xref_paths={},
        options=JobOptions(renderPreview=False, previewMaxEdgePx=2048),
        library=[],
    )


@pytest.mark.parametrize("layout", EXPECT.keys())
def test_7155_sheet_counts(engine_result, layout):
    deep = json.loads(DEEP.read_text(encoding="utf-8"))
    gt_items = deep["p7155_A1"]["layout_boq"][layout]["items"]
    gt_hidden = deep["p7155_A1"]["layout_boq"][layout]["hidden_by_freeze"]
    sheet_key = f"layout:{layout}"
    sheets = [s for s in engine_result.sheets if s.sheetKey == sheet_key]
    assert sheets, f"missing sheet {layout}"
    got = len([d for d in engine_result.detections if d.sheetKey == sheet_key])
    exp_count, exp_hidden = EXPECT[layout]
    assert got == exp_count, f"{layout}: detections {got} != expected {exp_count} (dwg_deep items {gt_items})"
    assert sheets[0].hiddenByLayers == exp_hidden, f"hidden {sheets[0].hiddenByLayers} != {gt_hidden}"