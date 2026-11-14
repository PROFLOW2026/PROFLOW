#!/usr/bin/env python3
"""Compare DWG engine per-layout counts to research ground truth (dwg_deep.json)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine.engine import DwgEngine, corpus_7155_path
from takeoff_worker.models import JobOptions

DEEP_PATH = (
    ROOT.parent
    / "docs/audits/blueprint-takeoff-research-2026-11/phase2/outputs/dwg_deep.json"
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dwg", default=None)
    ap.add_argument("--deep", default=str(DEEP_PATH))
    args = ap.parse_args()
    dwg = args.dwg or corpus_7155_path()
    if not dwg or not Path(dwg).is_file():
        print("No 7155 DWG found", file=sys.stderr)
        return 2
    deep = json.loads(Path(args.deep).read_text(encoding="utf-8"))
    gt = deep.get("p7155_A1", {}).get("layout_boq", {})
    out = DwgEngine().analyze(
        dwg,
        "7155",
        kind="dwg",
        xref_paths={},
        options=JobOptions(renderPreview=False),
        library=[],
    )
    print(f"File: {dwg}")
    print(f"Ground truth: {args.deep}")
    for layout, rec in sorted(gt.items()):
        sk = f"layout:{layout}"
        got = len([d for d in out.detections if d.sheetKey == sk])
        hidden = next((s.hiddenByLayers for s in out.sheets if s.sheetKey == sk), -1)
        ok = "OK" if got == rec["items"] and hidden == rec["hidden_by_freeze"] else "MISMATCH"
        print(
            f"  {layout}: det {got}/{rec['items']} hidden {hidden}/{rec['hidden_by_freeze']} [{ok}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())