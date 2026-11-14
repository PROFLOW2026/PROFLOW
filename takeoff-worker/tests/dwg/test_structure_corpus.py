"""Structure expectations from dwg_deep.json with on-demand DXF cache."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.dwg_engine.corpus_cache import ensure_dxf
from takeoff_worker.models import JobOptions

from .corpus_paths import resolve

REPO = Path(__file__).resolve().parents[3]
DEEP = json.loads(
    (REPO / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/dwg_deep.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize(
    "key,check",
    [
        ("p3031_M", "xrefs"),
        ("p3031_D123", "duplicates"),
        ("p3031_SW", "dynamic"),
    ],
)
def test_structure_matches_research(key, check):
    dwg = resolve(key)
    dxf, _, _ = ensure_dxf(dwg)
    out = DwgEngine().analyze(str(dxf), key, kind="dxf", xref_paths={}, options=JobOptions(renderPreview=False), library=[])
    deep = DEEP[key]
    if check == "xrefs":
        assert len(deep["xrefs"]) >= 1
        assert any(w.code == "xref_missing" for w in out.warnings)
    if check == "duplicates":
        assert deep["duplicate_inserts"]["extra_copies"] == 234
        assert float(out.stats.get("detections", 0)) > 0
    if check == "dynamic":
        assert deep["dynamic_inserts"]["total"] >= 800