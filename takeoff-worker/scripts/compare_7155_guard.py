"""Compare 7155 plan detections with default vs disabled heavy guards."""
from __future__ import annotations

import glob
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.models import JobOptions
from takeoff_worker.pdf_engine.engine import PdfVectorEngine
from takeoff_worker.pdf_engine.legend import build_legend_templates


def _sig(out):
    rows = []
    for d in sorted(out.detections, key=lambda x: x.id):
        rows.append(
            (
                d.id,
                d.legendKey,
                d.rawClass,
                d.typeKey,
                round(d.native.x, 2) if d.native else None,
                round(d.native.y, 2) if d.native else None,
                tuple(d.reasons),
            )
        )
    return rows


def run(env: dict[str, str]) -> None:
    for k, v in env.items():
        os.environ[k] = v
    leg = glob.glob(os.path.expanduser(r"~/Downloads/FW__*/**/7155-A1-מקרא.pdf"), recursive=True)[0]
    plan = glob.glob(os.path.expanduser(r"~/Downloads/FW__*/**/7155-A1-תאורה ג.pdf"), recursive=True)[0]
    eng = PdfVectorEngine()
    opt = JobOptions(renderPreview=False)
    tpls = build_legend_templates(eng.analyze(leg, "leg", options=opt, library=[]))
    out = eng.analyze(plan, "lg", options=opt, library=[], extra_templates=tpls)
    sh = out.sheets[0] if out.sheets else None
    wcodes = [w.code for w in out.warnings]
    print(
        f"label={env.get('LABEL','?')} analyzed={sh.analyzed if sh else None} "
        f"det={len(out.detections)} plan_qty={out.stats.get('plan_quantity_detections_p1')} "
        f"legend_zone={sum(1 for d in out.detections if 'legend_zone' in d.reasons)} "
        f"path_obj={out.stats.get('path_objects_p1')} raw_items={out.stats.get('drawing_items_raw_p1')} "
        f"noise_drop={out.stats.get('pdf_noise_paths_dropped_p1', 0)} "
        f"warnings={wcodes}"
    )
    return _sig(out)


def main() -> None:
    disabled = {
        "LABEL": "disabled",
        "PDF_MAX_PATH_OBJECTS": "9999999",
        "PDF_MAX_PATH_OBJECTS_HARD": "9999999",
        "PDF_MAX_PLAN_CANDIDATES": "9999999",
        "PDF_MAX_LEGEND_ROWS": "9999",
        "PDF_MAX_TEXT_CHARS": "9999999",
        "PDF_MAX_MATCH_CELLS": "999999999",
    }
    default = {"LABEL": "default"}
    for k in list(os.environ.keys()):
        if k.startswith("PDF_MAX_"):
            os.environ.pop(k, None)
    a = run(disabled)
    for k in list(os.environ.keys()):
        if k.startswith("PDF_MAX_") or k == "LABEL":
            os.environ.pop(k, None)
    b = run(default)
    print("identical", a == b, "len", len(a), len(b))
    if a != b:
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                print("first_diff", i, x, y)
                break


if __name__ == "__main__":
    main()