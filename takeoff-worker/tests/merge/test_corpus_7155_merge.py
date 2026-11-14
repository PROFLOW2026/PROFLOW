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


def _find(names: list[str]) -> list[str]:
    out = []
    for n in names:
        hits = glob.glob(str(DL / "FW__*/**" / n), recursive=True)
        if hits:
            out.append(hits[0])
    return out


@pytest.mark.skipif(len(_find(["7155-A1-תאורה ג.pdf", "7155-A1.dwg"])) < 2, reason="7155 corpus missing")
def test_7155_light_g_merge_recall():
    pdf, dwg = _find(["7155-A1-תאורה ג.pdf", "7155-A1.dwg"])
    sk = "layout:תאורה ג"
    po = PdfVectorEngine().analyze(pdf, "pdf", options=JobOptions(renderPreview=False), library=[])
    dwg_out = DwgEngine().analyze(
        dwg,
        "dwg",
        kind="dwg",
        xref_paths={},
        options=JobOptions(renderPreview=True, previewMaxEdgePx=4096),
        library=[],
        sheet_keys={sk},
    )
    pd = [d for d in po.detections if d.sheetKey == "p1"]
    dd = [d for d in dwg_out.detections if d.sheetKey == sk]
    ps = next(s for s in po.sheets if s.sheetKey == "p1")
    ds = next(s for s in dwg_out.sheets if s.sheetKey == sk)
    _, _, stats = merge_pdf_dwg_pair(pd, dd, ps, dwg_sheet=ds, dwg_source_path=dwg)
    _, _, stats2 = merge_pdf_dwg_pair(pd, dd, ps, dwg_sheet=ds, dwg_source_path=dwg)
    assert stats["merge_matched_pairs"] == stats2["merge_matched_pairs"]
    assert stats["merge_match_pct_dwg"] >= 65.0
    assert stats["merge_matched_pairs"] >= 0.65 * len(dd)