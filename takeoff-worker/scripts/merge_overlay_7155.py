#!/usr/bin/env python3
"""Render PDF + aligned DWG points for 7155 sheets → takeoff-worker/.tmp/merge-*.png."""
from __future__ import annotations

import glob
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.merge.geometric import (
    class_bucket,
    content_tol,
    detection_content_xy,
    geometric_align_dwg_to_pdf,
    greedy_match_two_pass,
    pdf_page_pt_size,
)
from takeoff_worker.merge.pdf_dwg import _plan_pdf
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine

OUT = ROOT / ".tmp"
DL = Path(os.environ.get("TAKEOFF_CORPUS", Path.home() / "Downloads"))

PAIRS = [
    ("7155-A1-תאורה ג.pdf", "תאורה ג"),
    ("7155-A1-תאורה ד.pdf", "תאורה ד"),
    ("7155-A1-חשמל ד.pdf", "חשמל ד"),
]


def _find_dwg() -> Path:
    return Path(glob.glob(str(DL / "FW__*/**/7155-A1.dwg"), recursive=True)[0])


def _find_pdf(name: str) -> Path:
    return Path(glob.glob(str(DL / "FW__*/**" / name), recursive=True)[0])


def main() -> int:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    dwg_path = _find_dwg()
    dwg_eng = DwgEngine()
    pdf_eng = PdfVectorEngine()

    for pdf_name, layout in PAIRS:
        pdf_path = _find_pdf(pdf_name)
        sk = f"layout:{layout}"
        po = pdf_eng.analyze(str(pdf_path), "pdf", options=JobOptions(renderPreview=False), library=[])
        dwg_out = dwg_eng.analyze(
            str(dwg_path),
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
        plan, _ = _plan_pdf(pd)
        pw, ph = pdf_page_pt_size(ps, pd)
        tol = content_tol(ps)
        Qa = np.array(
            [detection_content_xy(d, ps, pdf_page_w=pw, pdf_page_h=ph) for d in pd],
            dtype=float,
        )
        Qm = np.array(
            [detection_content_xy(d, ps, pdf_page_w=pw, pdf_page_h=ph) for d in plan],
            dtype=float,
        )
        P = np.array([detection_content_xy(d, ds) for d in dd], dtype=float)
        Pm = np.array(
            [[float(d.native.x), float(d.native.y)] if d.native else (d.x, d.y) for d in dd],
            dtype=float,
        )
        X, _, _, _ = geometric_align_dwg_to_pdf(
            P,
            Qa,
            class_p=[class_bucket(d) for d in dd],
            class_q=[class_bucket(d) for d in pd],
            tol=tol,
            P_model=Pm,
            dwg_source_path=str(dwg_path),
            layout_name=layout,
            pdf_w_pt=pw,
            pdf_h_pt=ph,
            pdf_portrait=ps.heightPx > ps.widthPx,
            dwg_landscape=ds.widthPx > ds.heightPx,
        )
        matches, _ = greedy_match_two_pass(
            Qm,
            X,
            [class_bucket(d) for d in plan],
            [class_bucket(d) for d in dd],
            tol,
            loose_factor=1.5,
        )
        matched_dwg = {j for _, j, _ in matches}
        fig, ax = plt.subplots(figsize=(8, 12))
        ax.scatter(Qm[:, 0], 1 - Qm[:, 1], s=8, c="blue", alpha=0.5, label="PDF plan")
        ax.scatter(X[:, 0], 1 - X[:, 1], s=6, c="gray", alpha=0.35, label="DWG aligned")
        xm = X[np.array([j for _, j, _ in matches], int)]
        ax.scatter(xm[:, 0], 1 - xm[:, 1], s=12, c="green", label="matched")
        um = [j for j in range(len(dd)) if j not in matched_dwg]
        if um:
            ax.scatter(X[um, 0], 1 - X[um, 1], s=10, c="red", marker="x", label="dwg_only")
        ax.set_title(f"{layout} pairs={len(matches)}/{len(dd)}")
        ax.legend(loc="upper right", fontsize=7)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        out = OUT / f"merge-{layout.replace(' ', '_')}.png"
        fig.savefig(out, dpi=120, bbox_inches="tight")
        plt.close(fig)
        print("wrote", out, "pairs", len(matches))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())