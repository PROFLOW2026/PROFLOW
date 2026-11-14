"""Audit embedded-legend linking for corpus PDFs (stdout JSON)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries  # noqa: E402
from takeoff_worker.classify.symbol_groups import assign_symbol_group_labels  # noqa: E402
from takeoff_worker.data.catalog_loader import load_default_catalog  # noqa: E402
from takeoff_worker.models import JobOptions  # noqa: E402
from takeoff_worker.pdf_engine.engine import PdfVectorEngine  # noqa: E402
from scripts.corpus_run import find  # noqa: E402


def audit(case: str, path: Path) -> dict:
    eng = PdfVectorEngine()
    out = eng.analyze(str(path), case, options=JobOptions(renderPreview=True), library=[])
    catalog = load_default_catalog()
    legend = classify_legend_entries(out.legend, catalog)
    dets = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    groups = assign_symbol_group_labels(dets)
    plan = [d for d in dets if "legend_zone" not in d.reasons]
    sk = out.sheets[0].sheetKey if out.sheets else "p1"
    legend_dec = int(out.stats.get(f"legend_rows_decodable_{sk}", 0))
    report = {
        "case": case,
        "detections": len(dets),
        "plan_qty": len(plan),
        "legend_rows": len(out.legend),
        "legend_decodable_rows": legend_dec,
        "legend_rows_typed": sum(1 for e in legend if e.typeKey),
        "legendKey_plan": sum(1 for d in plan if d.legendKey),
        "typed_plan": sum(1 for d in plan if d.typeKey),
        "typed_high_plan": sum(1 for d in plan if d.typeKey and d.confidence == "high"),
        "legend_zone": sum(1 for d in dets if "legend_zone" in d.reasons),
        "symbol_groups": groups,
        "unique_legend_keys": len({d.legendKey for d in plan if d.legendKey}),
    }
    if out.artifacts.get(f"preview-{case}-{sk}.png"):
        dest = ROOT / ".tmp" / f"overlay_{case}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(out.artifacts[f"preview-{case}-{sk}.png"])
        report["preview"] = str(dest)
    return report


def main() -> None:
    case = sys.argv[1] if len(sys.argv) > 1 else "as1749"
    paths = {
        "as1749": lambda: find("jm_6f1z25tXmEOEl_X/AS1749-A-K1.pdf"),
        "3643": lambda: find("Exponet_Files_20-07-2026 (1)/3643-EL-F1.pdf"),
        "2267": lambda: find("Fwd__*/2267-EL-F1.pdf"),
        "4285": lambda: find("Fwd*/**/*4285*", pick_name="4285-K1-2.pdf"),
    }
    path = paths[case]()
    print(json.dumps(audit(case, path), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()