"""Isolated DWG classification metrics. Writes JSON inside the repo. No DB, no ingest."""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.classify.pipeline_classify import classify_detections, classify_legend_entries
from takeoff_worker.data.catalog_loader import load_default_catalog
from takeoff_worker.dwg_engine.engine import DwgEngine, corpus_7155_path
from takeoff_worker.models import JobOptions

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "audits" / "takeoff-legend-classification-eval-2026-11-21.json"

FILES = {
    "3643": Path(r"C:\Users\ERAN YOSEF\Downloads\3643-EL - Standard\3643-EL.dwg"),
    "1545": Path(
        r"C:\Users\ERAN YOSEF\OneDrive\ProjectFlow\פרויקטים\PRJ-00001 - ברנדייס 6 תל אביב"
        r"\05 - תוכניות\1545-all-01 - Bitzua\1545-all-01.dwg"
    ),
    "7155": Path(corpus_7155_path() or ""),
}

EXPECTED_GEOM = {"3643": 1702, "1545": 1394}
SHEET_EXPECT = {
    "תאורה ג": 219,
    "תאורה ד": 92,
    "חשמל ג": 51,
    "חשמל ד": 29,
    "לוחות": 24,
}


def _block(det) -> str:
    name = getattr(det, "blockName", None) or det.signature or ""
    return str(name).replace("block:", "").lower()


def summarize(name: str, path: Path) -> dict:
    catalog = load_default_catalog()
    out = DwgEngine().analyze(
        str(path),
        name,
        kind="dwg",
        xref_paths={},
        options=JobOptions(renderPreview=False, previewMaxEdgePx=2048),
        library=[],
    )
    legend = classify_legend_entries(out.legend, catalog, library=[])
    detections = classify_detections(out.detections, catalog=catalog, library=[], legend=legend)
    plan = [d for d in detections if "legend_zone" not in d.reasons]
    by_sheet = Counter()
    for d in plan:
        sheet = next((s.name for s in out.sheets if s.sheetKey == d.sheetKey), d.sheetKey)
        by_sheet[sheet] += 1
    gold = {
        "12e": {
            "block": "12e",
            "texts": [
                (row.decodedText or row.rawText)
                for row in legend
                if _block(row) == "12e" or "12e" in row.signature.lower()
            ],
            "typeKeys": sorted({d.typeKey for d in plan if _block(d) == "12e" and d.typeKey}),
            "outdoor": sum(1 for d in plan if d.typeKey == "light.outdoor" and _block(d) == "12e"),
        },
        "36e": {
            "rowIds": sorted({row.key for row in legend if "36e" in row.signature.lower()}),
            "texts": [(row.decodedText or row.rawText) for row in legend if "36e" in row.signature.lower()],
            "typeKeys": sorted({d.typeKey for d in plan if _block(d) == "36e" and d.typeKey}),
        },
        "da3_generator_note": {
            "typeKeys": sorted({d.typeKey for d in plan if _block(d) == "da3" and d.typeKey}),
            "panel_main": sum(1 for d in plan if _block(d) == "da3" and d.typeKey == "panel.main"),
        },
        "pir_from_block_name": sum(
            1
            for d in plan
            if "pir" in _block(d) and d.typeKey
            and d.classifiedBy not in ("legend_text", "library")
        ),
        "phone_outdoor_phrase": None
        if match_legend_text("נקודה לטלפון חוץ", catalog) is None
        else match_legend_text("נקודה לטלפון חוץ", catalog).type_key,
        "light_point_ok": (match_legend_text("נקודת מאור", catalog) or type("", (), {"type_key": None})).type_key,
        "wall_light_ok": (match_legend_text("גוף תאורה קיר", catalog) or type("", (), {"type_key": None})).type_key,
        "switch_light_ok": (match_legend_text("מפסק מאור", catalog) or type("", (), {"type_key": None})).type_key,
    }
    classified_by = Counter(d.classifiedBy for d in plan if d.typeKey)
    return {
        "file": str(path),
        "found": path.is_file(),
        "geometric": len(plan),
        "expectedGeometric": EXPECTED_GEOM.get(name),
        "legendRowsRead": len(legend),
        "legendRowsMatched": sum(
            1
            for row in legend
            if row.signature and any(d.signature == row.signature for d in plan)
        ),
        "legendConflicts": len(
            {
                row.signature.lower()
                for row in legend
                if row.signatureKind == "dwg-block"
                and sum(1 for other in legend if other.signature == row.signature and not other.continuation) > 1
            }
        ),
        "autoClassified": sum(1 for d in plan if d.typeKey),
        "classifiedBy": dict(classified_by),
        "unclassified": sum(1 for d in plan if not d.typeKey),
        "lightOutdoor": sum(1 for d in plan if d.typeKey == "light.outdoor"),
        "panelMain": sum(1 for d in plan if d.typeKey == "panel.main"),
        "sheetCounts": dict(by_sheet),
        "uniqueLegendKeys": len({row.key for row in legend}),
        "dwgLegendKeySetOnDetections": sum(1 for d in plan if d.legendKey),
        "detectionsWithLegendRowIds": sum(1 for d in plan if d.legendRowIds),
        "gold": gold,
        "warnings": [{"code": w.code, "message": w.message} for w in out.warnings[:20]],
        "engineVersions": out.versions,
    }


def main() -> None:
    os.environ.setdefault("TAKEOFF_WORKER_BUILD", "local-eval")
    report = {"workerBuild": os.environ.get("TAKEOFF_WORKER_BUILD", "unknown"), "files": {}}
    for name, path in FILES.items():
        if not path.is_file():
            report["files"][name] = {"found": False, "file": str(path)}
            continue
        print(f"analyzing {name} {path}", flush=True)
        report["files"][name] = summarize(name, path)
        print(
            name,
            "geom",
            report["files"][name]["geometric"],
            "legend",
            report["files"][name]["legendRowsRead"],
            "typed",
            report["files"][name]["autoClassified"],
            flush=True,
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, flush=True)


if __name__ == "__main__":
    main()
