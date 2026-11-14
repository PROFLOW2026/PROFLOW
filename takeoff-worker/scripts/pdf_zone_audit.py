"""Engine-level legend zone + legend text audit (one process, sequential cases).

Run via: python scripts/run_capped.py --rss-gib 6 --timeout 300 -- python scripts/pdf_zone_audit.py CASE
"""
from __future__ import annotations

import glob
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.models import JobOptions  # noqa: E402
from takeoff_worker.pdf_engine.engine import PdfVectorEngine  # noqa: E402
from takeoff_worker.pdf_engine.legend import build_legend_templates  # noqa: E402

DL = Path.home() / "Downloads"


def find(pattern: str, pick: str | None = None) -> Path | None:
    hits = glob.glob(str(DL / pattern), recursive=True)
    if pick:
        sub = [h for h in hits if Path(h).name == pick]
        if sub:
            return Path(sub[0])
    return Path(hits[0]) if hits else None


def audit(case: str, path: Path, *, extra=None) -> None:
    eng = PdfVectorEngine()
    opt = JobOptions(renderPreview=False)
    t0 = time.perf_counter()
    out = eng.analyze(str(path), case, options=opt, library=[], extra_templates=extra or [])
    sec = time.perf_counter() - t0
    sk = "p1"
    zone = sum(1 for d in out.detections if "legend_zone" in d.reasons)
    plan = int(out.stats.get(f"plan_quantity_detections_{sk}", 0))
    fp = int(out.stats.get(f"legend_zone_false_positive_{sk}", 0))
    leg = len(out.legend)
    usable = int(out.stats.get("legend_text_usable", 0))
    bad = int(out.stats.get("legend_text_undecodable_count", 0))
    print(
        f"{case}\tfile={path.name}\tsec={sec:.1f}\tdet={len(out.detections)}\t"
        f"plan_qty={plan}\tlegend_zone={zone}\tfp_in_field={fp}\t"
        f"legend_rows={leg}\ttext_ok={usable}\ttext_bad={bad}"
    )
    vst = [w for w in out.warnings if w.code in ("raster_plan_unsupported", "raster_only_pdf")]
    if vst:
        print(f"  raster_warning: {vst[0].code}")


def main() -> None:
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else set()
    eng = PdfVectorEngine()
    leg7155 = find("FW__*/**/7155-A1-מקרא.pdf")
    plan7155 = find("FW__*/**/7155-A1-תאורה ג.pdf")
    extra = []
    if (not only or "7155_light_g" in only) and leg7155 and plan7155:
        extra = build_legend_templates(eng.analyze(str(leg7155), "leg", options=JobOptions(renderPreview=False), library=[]))
    jobs = [
        ("7155_light_g", plan7155, extra),
        ("3643", find("Exponet_Files_20-07-2026 (1)/3643-EL-F1.pdf"), []),
        ("2267", find("Fwd__*/2267-EL-F1.pdf"), []),
        ("4285", find("Fwd*/**/*4285*", "4285-K1-2.pdf"), []),
        ("as1749", find("jm_6f1z25tXmEOEl_X/AS1749-A-K1.pdf"), []),
        ("2302", find("Exponet_Files_20-07-2026/2302-EL-F1.pdf"), []),
        ("1727", find("jm_bk0tfFRDoky4enU/**/1727-k1.pdf"), []),
    ]
    for case, path, ex in jobs:
        if only and case not in only:
            continue
        if path is None or not path.is_file():
            print(f"{case}\tMISSING")
            continue
        audit(case, path, extra=ex)


if __name__ == "__main__":
    main()