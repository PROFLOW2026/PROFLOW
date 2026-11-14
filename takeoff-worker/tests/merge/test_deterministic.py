from __future__ import annotations

import glob
import os
from pathlib import Path

import pytest

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.merge.pdf_dwg import merge_pdf_dwg_pair
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine

DL = Path(os.environ.get("TAKEOFF_CORPUS", Path.home() / "Downloads"))


@pytest.mark.skipif(
    not glob.glob(str(DL / "FW__*/**/7155-A1.dwg"), recursive=True),
    reason="7155 corpus missing",
)
def test_merge_7155_light_g_is_deterministic():
    pdf = glob.glob(str(DL / "FW__*/**/7155-A1-תאורה ג.pdf"), recursive=True)[0]
    dwg = glob.glob(str(DL / "FW__*/**/7155-A1.dwg"), recursive=True)[0]
    sk = "layout:תאורה ג"
    opts = JobOptions(renderPreview=False)
    po = PdfVectorEngine().analyze(pdf, "pdf", options=opts, library=[])
    dwg_opts = JobOptions(renderPreview=True, previewMaxEdgePx=4096)
    dwg_out = DwgEngine().analyze(
        dwg,
        "dwg",
        kind="dwg",
        xref_paths={},
        options=dwg_opts,
        library=[],
        sheet_keys={sk},
    )
    pd = [d for d in po.detections if d.sheetKey == "p1"]
    dd = [d for d in dwg_out.detections if d.sheetKey == sk]
    ps = next(s for s in po.sheets if s.sheetKey == "p1")
    ds = next(s for s in dwg_out.sheets if s.sheetKey == sk)

    counts = []
    for _ in range(3):
        _, _, stats = merge_pdf_dwg_pair(pd, dd, ps, dwg_sheet=ds, dwg_source_path=dwg)
        counts.append(int(stats["merge_matched_pairs"]))
    assert len(set(counts)) == 1, f"non-deterministic merge counts {counts}"
    assert counts[0] >= int(0.65 * len(dd))