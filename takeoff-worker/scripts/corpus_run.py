"""Lead tool: run the REAL pipeline (real engines) on corpus files offline and print an honest summary.

usage: python scripts/corpus_run.py <case> [--json out.json]
cases: 7155_light_g | 7155_all | 3643 | 2267 | 4285 | 2302 | 1727 | as1749
        | dwg_3031_m | dwg_3031_d123 | dwg_3031_sw | dwg_3031_gnd | dwg_3031_pit | dwg_3031_d124
"""
from __future__ import annotations

import collections
import glob
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from takeoff_worker.models import CatalogType, JobOptions, SheetSelection, WorkerCallback, WorkerFile, WorkerJobRequest, Pairing  # noqa: E402
from takeoff_worker.pipeline import run_job  # noqa: E402

DL = Path.home() / "Downloads"


def find(pattern: str, *, pick_name: str | None = None) -> Path:
    hits = glob.glob(str(DL / pattern), recursive=True)
    if pick_name:
        sub = [h for h in hits if Path(h).name == pick_name]
        if sub:
            return Path(sub[0])
    if not hits:
        raise SystemExit(f"corpus file missing: {pattern}")
    return Path(hits[0])


def catalog() -> list[CatalogType]:
    data = json.loads((ROOT / "takeoff_worker" / "data" / "catalog.default.json").read_text(encoding="utf-8"))
    types = data["types"] if isinstance(data, dict) and "types" in data else data
    return [CatalogType(**t) for t in types]


def case_files(name: str) -> tuple[list[tuple[str, Path, str]], list[tuple[str, str]]]:
    if name.startswith("7155"):
        base = "FW__*/**/"
        legend = find("FW__*/**/7155-A1-מקרא.pdf")
        light_g = find("FW__*/**/7155-A1-תאורה ג.pdf")
        dwg = find("FW__*/**/7155-A1.dwg")
        files = [("legend", legend, "pdf"), ("lightg", light_g, "pdf"), ("dwg", dwg, "dwg")]
        if name == "7155_all":
            for key, nm in [("lightd", "7155-A1-תאורה ד.pdf"), ("elecg", "7155-A1-חשמל ג.pdf"), ("elecd", "7155-A1-חשמל ד.pdf")]:
                files.append((key, find("FW__*/**/" + nm), "pdf"))
        return files, [("lightg", "dwg")]
    bd = DL / "בדיקה"
    dwg_map = {
        "dwg_3031_m": bd / "3031-M.dwg",
        "dwg_3031_d123": bd / "3031-DIROT 123.dwg",
        "dwg_3031_d124": bd / "3031-DIROT 124.dwg",
        "dwg_3031_sw": bd / "3031-SW.dwg",
        "dwg_3031_gnd": bd / "3031-GND.dwg",
        "dwg_3031_pit": bd / "3031-PIT.dwg",
    }
    if name in dwg_map:
        p = dwg_map[name]
        if not p.is_file():
            raise SystemExit(f"corpus file missing: {p}")
        return [(name.replace("dwg_", ""), p, "dwg")], []
    paths = {
        "3643": "Exponet_Files_20-07-2026 (1)/3643-EL-F1.pdf",
        "2267": "Fwd__*/2267-EL-F1.pdf",
        "4285": "Fwd*/**/*4285*",
        "2302": "Exponet_Files_20-07-2026/2302-EL-F1.pdf",
        "1727": "jm_bk0tfFRDoky4enU/**/1727-k1.pdf",
        "as1749": "jm_6f1z25tXmEOEl_X/AS1749-A-K1.pdf",
    }
    if name == "4285":
        return [(name, find(paths[name], pick_name="4285-K1-2.pdf"), "pdf")], []
    return [(name, find(paths[name]), "pdf")], []


def main() -> None:
    case = sys.argv[1]
    files, pairs = case_files(case)
    work = Path(tempfile.mkdtemp(prefix="takeoff_corpus_"))
    src_by_url = {}
    wfiles = []
    for fid, path, kind in files:
        url = f"file://{fid}"
        src_by_url[url] = path
        wfiles.append(WorkerFile(fileId=fid, name=path.name, kind=kind, sizeBytes=path.stat().st_size, downloadUrl=url))
    sheet_sel: list[SheetSelection] = []
    if case == "7155_light_g":
        sheet_sel = [
            SheetSelection(fileId="legend", sheetKey="p1"),
            SheetSelection(fileId="lightg", sheetKey="p1"),
            SheetSelection(fileId="dwg", sheetKey="layout:מקרא"),
            SheetSelection(fileId="dwg", sheetKey="layout:תאורה ג"),
        ]
    req = WorkerJobRequest(
        jobId="corpus-" + case, plannerKey=case, files=wfiles,
        pairing=[Pairing(pdfFileId=a, dwgFileId=b) for a, b in pairs],
        sheetSelection=sheet_sel,
        catalog=catalog(), symbolLibrary=[],
        callback=WorkerCallback(progressUrl="x", resultUrl="x", artifactUrl="x", token="x"),
        options=JobOptions(renderPreview=bool(pairs), previewMaxEdgePx=4096 if pairs else 2048),
    )
    artifacts: dict[str, int] = {}

    def download(url: str, dest: Path) -> Path:
        shutil.copy(src_by_url[url], dest)
        return dest

    def put(name: str, data: bytes, ctype: str) -> None:
        artifacts[name] = len(data)

    t0 = time.time()
    stages = []
    res = run_job(req, work, lambda s, p, m=None: stages.append((s, round(p), m)), put, download)
    dt = time.time() - t0
    byt = collections.Counter((d.sheetKey, d.fileId, d.typeKey or "UNCLASSIFIED") for d in res.detections)
    print(f"case={case} status={res.status} secs={dt:.1f} sheets={len(res.sheets)} detections={len(res.detections)} legend={len(res.legend)} artifacts={len(artifacts)}")
    conf = collections.Counter(d.confidence for d in res.detections)
    classified = sum(1 for d in res.detections if d.typeKey)
    plan = [d for d in res.detections if "legend_zone" not in d.reasons]
    pct = f"{100 * classified / len(res.detections):.1f}%" if res.detections else "n/a"
    plan_pct = f"{100 * sum(1 for d in plan if d.typeKey) / len(plan):.1f}%" if plan else "n/a"
    high = int(res.stats.get("classified_high_count", sum(1 for d in plan if d.typeKey and d.confidence == "high")))
    uncl = int(res.stats.get("unclassified_plan_count", sum(1 for d in plan if not d.typeKey)))
    print(
        f"metrics: det={len(res.detections)} plan_qty={len(plan)} classified={classified} ({pct}) "
        f"plan_classified_pct={plan_pct} high_conf={high} unclassified_plan={uncl} "
        f"legend_usable={int(res.stats.get('legend_text_usable', 0))} "
        f"legend_undecodable={int(res.stats.get('legend_text_undecodable_count', 0))} "
        f"symbol_groups={int(res.stats.get('symbol_group_count', 0))}"
    )
    print("confidence:", dict(conf), "| classified:", classified, "/", len(res.detections))
    for s in res.sheets:
        n = sum(1 for d in res.detections if d.sheetKey == s.sheetKey and d.fileId == s.fileId)
        print(f"  sheet {s.fileId}:{s.sheetKey} '{s.name}' {s.widthPx}x{s.heightPx} analyzed={s.analyzed} det={n} hidden={s.hiddenByLayers} scale={s.scale.ratio}/{s.scale.verified}")
    print("warnings:", [(w.code, w.message[:80]) for w in res.warnings][:8])
    print("errors:", [(e.code, e.message[:100]) for e in res.errors][:8])
    merge_pct = res.stats.get("merge_match_pct_pdf")
    if merge_pct is not None:
        print(f"merge_match_pct_pdf={merge_pct:.1f}% pairs={int(res.stats.get('merge_matched_pairs', 0))}")
    twins = sum(1 for d in res.detections if d.twinId) // 2
    if twins:
        print(f"merge_twin_pairs={twins}")
    timing = {k: v for k, v in res.stats.items() if k.startswith("timing_") or k.startswith("merge_")}
    boq = {k: res.stats[k] for k in res.stats if k.startswith("boq_")}
    if boq:
        print("boq_counting:", boq)
    print("timing/stats:", {**timing, **{k: v for k, v in res.stats.items() if not k.startswith("timing_") and not k.startswith("merge_")}})
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(res.model_dump_json(indent=1), encoding="utf-8")
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
