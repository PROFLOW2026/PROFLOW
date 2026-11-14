#!/usr/bin/env python3
"""DWG-only corpus batch → docs/.../EVAL-DWG-CORPUS.md (read-only paths under Downloads)."""
from __future__ import annotations

import glob
import os
import sys
import time
import tracemalloc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from takeoff_worker.dwg_engine import DwgEngine
from takeoff_worker.models import JobOptions, SymbolLibraryEntry

OUT = REPO / "docs" / "implementation" / "electrical-takeoff" / "EVAL-DWG-CORPUS.md"
DL = Path.home() / "Downloads"
BDAKA = DL / "בדיקה"

CASES = [
    ("3031-M", BDAKA / "3031-M.dwg"),
    ("3031-D123", BDAKA / "3031-DIROT 123.dwg"),
    ("3031-D124", BDAKA / "3031-DIROT 124.dwg"),
    ("3031-SW", BDAKA / "3031-SW.dwg"),
    ("3031-GND", BDAKA / "3031-GND.dwg"),
    ("3031-PIT", BDAKA / "3031-PIT.dwg"),
]


def _discover_extra() -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    for pattern, label in [
        ("**/3096*EL*.dwg", "3096-EL"),
        ("**/3621*EL*.dwg", "3621-EL"),
        ("**/G1*.dwg", "G1"),
        ("**/G2*.dwg", "G2"),
    ]:
        for p in glob.glob(str(DL / pattern), recursive=True):
            path = Path(p)
            if path.is_file() and path.stat().st_size < 200_000_000:
                out.append((f"{label}:{path.name}", path))
                break
    return out


def analyze_one(name: str, path: Path) -> dict:
    if not path.is_file():
        return {"name": name, "error": "missing"}
    tracemalloc.start()
    t0 = time.perf_counter()
    eng = DwgEngine()
    try:
        out = eng.analyze(
            str(path),
            name,
            kind="dwg",
            xref_paths={},
            options=JobOptions(renderPreview=True, previewMaxEdgePx=2048),
            library=[],
        )
    except Exception as ex:
        return {"name": name, "path": str(path), "error": str(ex)[:200]}
    dt = time.perf_counter() - t0
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    dets = out.detections or []
    classified = sum(1 for d in dets if d.typeKey)
    codes = [w.code for w in (out.warnings or [])]
    layouts = [s for s in (out.sheets or []) if s.kind.startswith("dwg")]
    return {
        "name": name,
        "path": str(path),
        "secs": round(dt, 1),
        "peak_mb": round(peak / (1024 * 1024), 1),
        "sheets": len(layouts),
        "detections": len(dets),
        "classified_pct": round(100.0 * classified / max(len(dets), 1), 1),
        "convert_secs": out.stats.get("dwg_convert_secs"),
        "cache_hit": bool(out.stats.get("dwg_convert_cache_hit")),
        "warnings": ", ".join(sorted(set(codes)))[:120],
        "sample_sheets": ", ".join(f"{s.name}({s.hiddenByLayers}h)" for s in layouts[:6]),
    }


def main() -> int:
    rows: list[dict] = []
    for name, path in CASES + _discover_extra():
        print("analyzing", name, flush=True)
        rows.append(analyze_one(name, path))

    lines = [
        "# DWG corpus evaluation (engine-only)",
        "",
        f"Root: `{BDAKA}` and discovered under `{DL}` (read-only).",
        "",
        "| Case | sec | peak MB | sheets | det | classified % | convert s | cache | warnings | layouts (hidden) |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
    ]
    for r in rows:
        if r.get("error"):
            lines.append(f"| {r['name']} | — | — | — | — | — | — | — | **{r['error']}** | — |")
            continue
        lines.append(
            f"| {r['name']} | {r['secs']} | {r['peak_mb']} | {r['sheets']} | {r['detections']} | "
            f"{r['classified_pct']} | {r.get('convert_secs', '—')} | {r['cache_hit']} | {r['warnings']} | "
            f"{r.get('sample_sheets', '')} |"
        )
    lines += [
        "",
        "## Notes",
        "- Convert/analyze timings from `dwg_engine` stats; on-demand DXF cache: `takeoff-worker/.cache/` (gitignored).",
        "- 3031 viewport: `pick_sheet_viewport` uses insert density (not `regs[-1]`).",
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("Wrote", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())