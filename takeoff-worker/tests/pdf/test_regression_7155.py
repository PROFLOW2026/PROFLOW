"""Regression against phase2/res7155_all_runs.json expectations."""
from __future__ import annotations

import collections
import glob
import json
import os
from pathlib import Path

import pytest

from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine
from takeoff_worker.pdf_engine.legend import build_legend_templates

ROOT = Path(__file__).resolve().parents[3]
EXPECT = ROOT / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/res7155_all_runs.json"


def _find_7155(name: str) -> str | None:
    base = os.path.expanduser(r"~\Downloads")
    hits = glob.glob(base + r"/FW__*/**/" + name, recursive=True)
    return hits[0] if hits else None


@pytest.mark.skipif(not EXPECT.is_file(), reason="expectations json missing")
@pytest.mark.skipif(_find_7155("7155-A1-תאורה ג.pdf") is None, reason="corpus missing")
def test_7155_candidate_count_tolerance():
    exp = json.loads(EXPECT.read_text(encoding="utf-8"))
    row = exp["7155_light_g"]
    expected_n = row["n_cands"]
    leg = _find_7155("7155-A1-מקרא.pdf")
    plan = _find_7155("7155-A1-תאורה ג.pdf")
    assert leg and plan
    eng = PdfVectorEngine()
    tpls = build_legend_templates(eng.analyze(leg, "legend", options=JobOptions(renderPreview=False), library=[]))
    out = eng.analyze(plan, "f", options=JobOptions(renderPreview=False), library=[], extra_templates=tpls)
    det_n = len(out.detections)
    plan_n = int(out.stats.get("plan_quantity_detections_p1", det_n))
    zone_n = sum(1 for d in out.detections if "legend_zone" in d.reasons)
    lo = expected_n * 0.35
    hi = expected_n * 1.8
    assert lo <= det_n <= hi, f"detections={det_n} expected~{expected_n}"
    assert plan_n + zone_n == det_n
    assert 35 <= zone_n <= 55, f"legend_zone={zone_n} expected~40-52"
    assert sum(1 for d in out.detections if d.legendKey and "legend_zone" not in d.reasons) >= plan_n * 0.75


@pytest.mark.skipif(_find_7155("7155-A1-מקרא.pdf") is None, reason="corpus missing")
def test_legend_pdf_rows():
    eng = PdfVectorEngine()
    out = eng.analyze(_find_7155("7155-A1-מקרא.pdf"), "legend", options=JobOptions(renderPreview=False), library=[])
    assert len(out.legend) >= 20
    tpls = build_legend_templates(out)
    assert all(t.mask_b64 for t in tpls)