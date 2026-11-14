#!/usr/bin/env python3
"""Per-file DWG corpus summary (block shown/hidden counts by layout)."""
from __future__ import annotations

import glob
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.dwg_engine.corpus_cache import ensure_dxf
from takeoff_worker.models import JobOptions

DL = Path(os.environ.get("TAKEOFF_CORPUS", Path.home() / "Downloads"))

FILES = {
    "3031-M": DL / "בדיקה" / "3031-M.dwg",
    "3031-SW": DL / "בדיקה" / "3031-SW.dwg",
    "3031-GND": DL / "בדיקה" / "3031-GND.dwg",
    "3031-PIT": DL / "בדיקה" / "3031-PIT.dwg",
    "3031-D123": DL / "בדיקה" / "3031-DIROT 123.dwg",
    "3031-D124": DL / "בדיקה" / "3031-DIROT 124.dwg",
}


def _find(name_glob: str) -> Path | None:
    hits = glob.glob(str(DL / "**" / name_glob), recursive=True)
    return Path(hits[0]) if hits else None


def main() -> int:
    extra = {
        "3096-EL": _find("3096-EL.dwg"),
        "3621-EL": _find("3621-EL.dwg"),
        "3621-G1": _find("G1.dwg"),
        "3621-G2": _find("G2.dwg"),
        "7155-A1": _find("7155-A1.dwg"),
    }
    all_files = {**FILES, **{k: v for k, v in extra.items() if v}}
    report = {"files": {}, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
    eng = DwgEngine()
    for key, path in all_files.items():
        if not path or not path.is_file():
            report["files"][key] = {"error": "missing"}
            continue
        t0 = time.time()
        try:
            dxf, conv, hit = ensure_dxf(path)
            out = eng.analyze(str(path), key, kind="dwg", xref_paths={}, options=JobOptions(renderPreview=False), library=[])
            by_layout = {}
            for sh in out.sheets:
                dets = [d for d in out.detections if d.sheetKey == sh.sheetKey]
                tallies = Counter((d.rawClass, d.layer or "") for d in dets)
                by_layout[sh.name] = {
                    "shown": len(dets),
                    "hiddenByLayers": sh.hiddenByLayers,
                    "analyzed": sh.analyzed,
                    "top": tallies.most_common(8),
                }
            report["files"][key] = {
                "path": str(path),
                "convert_secs": conv.convert_secs if conv else 0,
                "cache_hit": hit,
                "unstable": out.stats.get("dwg_unstable_objects"),
                "warnings": [w.code for w in out.warnings],
                "layouts": by_layout,
                "analyze_secs": out.stats.get("analyze_secs"),
                "legend_decoded": sum(1 for e in out.legend if e.decodedText),
                "legend_total": len(out.legend),
            }
        except Exception as ex:
            report["files"][key] = {"error": str(ex)[:300]}
        report["files"][key]["elapsed"] = round(time.time() - t0, 2)
    out_path = ROOT / "scripts" / "corpus_dwg_report.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())