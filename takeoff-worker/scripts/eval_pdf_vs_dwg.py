#!/usr/bin/env python3
"""7155 PDF vs DWG detection comparison → docs/.../EVAL-7155.md (DWG = oracle)."""
from __future__ import annotations

import glob
import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.merge.pdf_dwg import merge_pdf_dwg_pair
from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine

OUT = REPO / "docs/implementation/electrical-takeoff/EVAL-7155.md"
DL = Path(os.environ.get("TAKEOFF_CORPUS", Path.home() / "Downloads"))

PAIRS = [
    ("7155-A1-תאורה ג.pdf", "תאורה ג"),
    ("7155-A1-תאורה ד.pdf", "תאורה ד"),
    ("7155-A1-חשמל ג.pdf", "חשמל ג"),
    ("7155-A1-חשמל ד.pdf", "חשמל ד"),
]


def find_pdf(name: str) -> Path | None:
    hits = glob.glob(str(DL / "FW__*/**" / name), recursive=True) + glob.glob(str(DL / "**" / name), recursive=True)
    return Path(hits[0]) if hits else None


def find_dwg() -> Path | None:
    hits = glob.glob(str(DL / "FW__*/**/7155-A1.dwg"), recursive=True)
    return Path(hits[0]) if hits else None


def _class_key(d) -> str:
    return d.typeKey or d.rawClass or d.blockName or "unknown"


def main() -> int:
    dwg = find_dwg()
    if not dwg:
        print("7155 DWG missing", file=sys.stderr)
        return 2
    pdf_eng = PdfVectorEngine()
    dwg_eng = DwgEngine()
    lines = [
        "# 7155 PDF vs DWG evaluation",
        "",
        "Ground truth label: **DWG oracle** (viewport + frozen layers), not human control count.",
        "",
        f"DWG: `{dwg}`",
        "",
        "Alignment: PDF page-pt content space ↔ DWG viewport preview (`merge.geometric`, fit8 + class-weighted 1:1).",
        "",
        "| Sheet | PDF det | plan PDF | DWG det | Pairs | DWG % | plan % | 2nd pass | PDF-only | DWG-only | med residual (pt) |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    symbol_rows: list[str] = []
    detail_blocks: list[str] = []
    for pdf_name, layout in PAIRS:
        pdf_path = find_pdf(pdf_name)
        if not pdf_path:
            lines.append(f"| {layout} | — | — | — | — | — | — | — | PDF missing |")
            continue
        sk = f"layout:{layout}"
        po = pdf_eng.analyze(str(pdf_path), "pdf", options=JobOptions(renderPreview=False), library=[])
        dwg_out = dwg_eng.analyze(
            str(dwg),
            "dwg",
            kind="dwg",
            xref_paths={},
            options=JobOptions(renderPreview=True, previewMaxEdgePx=4096),
            library=[],
            sheet_keys={sk},
        )
        pd = [d for d in po.detections if d.sheetKey == "p1"]
        dd = [d for d in dwg_out.detections if d.sheetKey == sk]
        if not pd or not dd:
            lines.append(f"| {layout} | {len(pd)} | {len(dd)} | 0 | 0 | {len(pd)} | {len(dd)} | — | — |")
            continue
        ps = next(s for s in po.sheets if s.sheetKey == "p1")
        ds = next(s for s in dwg_out.sheets if s.sheetKey == sk)
        plan_n = sum(1 for d in pd if "legend_zone" not in d.reasons)
        merged, _, stats = merge_pdf_dwg_pair(pd, dd, ps, dwg_sheet=ds, dwg_source_path=str(dwg))
        pairs = int(stats.get("merge_matched_pairs", 0))
        plan_pct = 100.0 * pairs / max(plan_n, 1)
        lines.append(
            f"| {layout} | {len(pd)} | {plan_n} | {len(dd)} | {pairs} | "
            f"{stats.get('merge_match_pct_dwg', 0):.1f} | {plan_pct:.1f} | {int(stats.get('merge_second_pass_pairs', 0))} | "
            f"{int(stats.get('merge_pdf_only', 0))} | {int(stats.get('merge_dwg_only', 0))} | "
            f"{stats.get('merge_residual_median_pt', 0):.1f} |"
        )
        detail_blocks.append(f"### {layout}\n\n```json\n{json.dumps({k: v for k, v in stats.items()}, indent=2)}\n```\n")
        by_sig = Counter(_class_key(d) for d in dd)
        pdf_by = Counter(_class_key(d) for d in pd)
        for sig in sorted(set(by_sig) | set(pdf_by)):
            symbol_rows.append(f"| {layout} | `{sig}` | {pdf_by.get(sig, 0)} | {by_sig.get(sig, 0)} |")
    lines += ["", "## Per-symbol (DWG oracle counts)", "", "| Sheet | Symbol | PDF | DWG |", "|---|---|---:|---:|"]
    lines += symbol_rows
    lines += ["", "## Merge stats detail", ""] + detail_blocks
    lines += [
        "",
        "## Notes",
        "- Layout pairing: PDF filename Hebrew tail ↔ DWG layout name (e.g. `7155-A1-חשמל ג.pdf` → layout `חשמל ג`, not `תאורה ג`).",
        "- `חשמל ג` DWG shows **51** visible / **219** hidden (inverse of `תאורה ג`); PDF counts should track visible layout only.",
        "- DWG `hiddenByLayers` symbols are not in detection list and must not be treated as missing BoQ.",
        "- Unmatched PDF: margin legend keys / `legend_zone`; unmatched DWG: alignment gaps (not frozen inserts).",
        "- Merge uses distinct review reasons `pdf_only` / `dwg_only`; twins count once for BoQ.",
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())