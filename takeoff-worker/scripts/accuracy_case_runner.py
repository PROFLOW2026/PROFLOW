"""Single-case runner for accuracy_report subprocess children."""
from __future__ import annotations

import collections
import glob
import shutil
import tempfile
import time
from pathlib import Path

from takeoff_worker.models import JobOptions, Pairing, SheetSelection, WorkerCallback, WorkerFile, WorkerJobRequest
from takeoff_worker.pipeline import run_job

from scripts import corpus_run as corpus

ROOT = Path(__file__).resolve().parents[1]
DL = Path.home() / "Downloads"


def _find_dwg(pattern: str) -> Path:
    hits = glob.glob(str(DL / pattern), recursive=True)
    if not hits:
        raise FileNotFoundError(pattern)
    return Path(hits[0])


def run_accuracy_case(name: str, *, dwg_only: str | None = None) -> dict:
    work = Path(tempfile.mkdtemp(prefix=f"acc_{name}_"))
    t0 = time.time()
    try:
        if dwg_only:
            path = _find_dwg(f"**/*{dwg_only}*")
            files = [(f"dwg-{dwg_only}", path, "dwg")]
            pairs: list[tuple[str, str]] = []
        else:
            files, pairs = corpus.case_files(name)

        sheet_sel: list[SheetSelection] = []
        if name == "7155_light_g":
            sheet_sel = [
                SheetSelection(fileId="legend", sheetKey="p1"),
                SheetSelection(fileId="lightg", sheetKey="p1"),
                SheetSelection(fileId="dwg", sheetKey="layout:מקרא"),
                SheetSelection(fileId="dwg", sheetKey="layout:תאורה ג"),
            ]

        src = {}
        wfiles = []
        for fid, path, kind in files:
            url = f"file://{fid}"
            src[url] = path
            wfiles.append(WorkerFile(fileId=fid, name=path.name, kind=kind, sizeBytes=path.stat().st_size, downloadUrl=url))

        req = WorkerJobRequest(
            jobId=f"acc-{name}",
            plannerKey=name,
            files=wfiles,
            pairing=[Pairing(pdfFileId=a, dwgFileId=b) for a, b in pairs],
            sheetSelection=sheet_sel,
            catalog=corpus.catalog(),
            symbolLibrary=[],
            callback=WorkerCallback(progressUrl="x", resultUrl="x", artifactUrl="x", token="x"),
            options=JobOptions(renderPreview=bool(pairs), previewMaxEdgePx=4096 if pairs else 2048),
        )

        def dl(url: str, dest: Path) -> Path:
            shutil.copy(src[url], dest)
            return dest

        res = run_job(req, work, lambda *a, **k: None, lambda *a, **k: None, dl)
        wall = time.time() - t0
        conf = collections.Counter(d.confidence for d in res.detections)
        n = len(res.detections)
        classified = sum(1 for d in res.detections if d.typeKey)
        gt = (
            "DWG oracle + PDF↔DWG agreement"
            if name == "7155_light_g"
            else ("DWG oracle (layout counts only)" if dwg_only else "no ground truth: unverified")
        )
        plan = sum(1 for d in res.detections if "legend_zone" not in d.reasons)
        return {
            "case": name if not dwg_only else f"dwg-{dwg_only}",
            "status": res.status,
            "wall_sec": wall,
            "detections": n,
            "plan_qty_detections": plan,
            "classified": classified,
            "classified_pct": f"{100 * classified / n:.1f}%" if n else "n/a",
            "plan_classified_pct": f"{100 * sum(1 for d in res.detections if d.typeKey and 'legend_zone' not in d.reasons) / plan:.1f}%"
            if plan
            else "n/a",
            "classified_high": int(res.stats.get("classified_high_count", 0)),
            "unclassified_plan": int(res.stats.get("unclassified_plan_count", 0)),
            "legend_text_usable": int(res.stats.get("legend_text_usable", 0)),
            "legend_text_undecodable": int(res.stats.get("legend_text_undecodable_count", 0)),
            "legend_rows_classified": int(res.stats.get("legend_rows_classified", 0)),
            "classified_pdf_pct": res.stats.get("classified_pdf_pct"),
            "classified_dwg_pct": res.stats.get("classified_dwg_pct"),
            "boq_countable": res.stats.get("boq_countable"),
            "boq_excluded_legend_zone": res.stats.get("boq_excluded_legend_zone"),
            "merge_pct": res.stats.get("merge_match_pct_pdf"),
            "merge_pairs": res.stats.get("merge_matched_pairs"),
            "confidence": dict(conf),
            "ground_truth": gt,
        }
    except Exception as exc:
        return {
            "case": name,
            "status": "error",
            "wall_sec": time.time() - t0,
            "error": repr(exc),
            "ground_truth": "partial: unverified",
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)