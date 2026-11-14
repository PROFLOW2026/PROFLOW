import glob
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.merge.pdf_dwg import merge_pdf_dwg_pair
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine

DL = Path(os.path.expanduser("~/Downloads"))
dwg = glob.glob(str(DL / "FW__*/**/7155-A1.dwg"), recursive=True)[0]
layouts = ["תאורה ג", "תאורה ד", "חשמל ג", "חשמל ד"]
pdfs = [
    ("תאורה ג", "7155-A1-תאורה ג.pdf"),
    ("תאורה ד", "7155-A1-תאורה ד.pdf"),
    ("חשמל ג", "7155-A1-חשמל ג.pdf"),
    ("חשמל ד", "7155-A1-חשמל ד.pdf"),
]
dwg_eng = DwgEngine()
dwg_out = dwg_eng.analyze(
    dwg,
    "dwg",
    kind="dwg",
    xref_paths={},
    options=JobOptions(renderPreview=True, previewMaxEdgePx=4096),
    library=[],
)
pdf_eng = PdfVectorEngine()
for pname, fn in pdfs:
    pdf = glob.glob(str(DL / "FW__*/**" / fn), recursive=True)[0]
    po = pdf_eng.analyze(pdf, "pdf", options=JobOptions(renderPreview=False), library=[])
    pd = [d for d in po.detections if d.sheetKey == "p1" and "legend_zone" not in d.reasons]
    ps = next(s for s in po.sheets if s.sheetKey == "p1")
    print(f"=== PDF {pname} det={len(pd)}")
    best = ("", 0)
    for lay in layouts:
        sk = f"layout:{lay}"
        dd = [d for d in dwg_out.detections if d.sheetKey == sk]
        ds = next(s for s in dwg_out.sheets if s.sheetKey == sk)
        _, _, st = merge_pdf_dwg_pair(pd, dd, ps, dwg_sheet=ds, dwg_source_path=dwg)
        m = int(st["merge_matched_pairs"])
        if m > best[1]:
            best = (lay, m)
        mark = "*" if lay == pname else " "
        print(f" {mark}{lay}: {m}/{len(dd)} ({st['merge_match_pct_dwg']:.0f}%) hidden={ds.hiddenByLayers}")
    print(f" best_layout={best[0]} pairs={best[1]} expected={pname} ok={best[0]==pname}")