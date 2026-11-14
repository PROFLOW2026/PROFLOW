"""Takeoff worker orchestration (agent 3)."""
from __future__ import annotations

import logging
import os
import re
import time
import warnings
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

warnings.filterwarnings("ignore", message=".*[Ii]gnoring fixed.*")
os.environ.setdefault("MPLBACKEND", "Agg")

from .ai.legend_reader import get_legend_reader
from .classify import classify_detections, classify_legend_entries
from .classify.ai_enrich import ai_rows_for_legend
from .classify.confidence import calibrate_confidences
from .classify.counting_policy import boq_count_summary
from .classify.pdf_legend_bridge import attach_mask_artifacts, integrate_pdf_legend_templates
from .classify.symbol_groups import assign_symbol_group_labels
from .classify.twin_vote import apply_twin_voting, side_stats, top_type_table
from .engine_api import EngineOutput, LegendTemplate, PdfEngine, DwgEngine
from .merge.pdf_dwg import merge_pdf_dwg_pair
from .merge.unpaired import apply_unpaired_pdf_policy
from .merge.sheet_pair import filter_detections, index_dwg_by_sheet, pick_dwg_sheet_for_pdf
from .models import WorkerDetection, WorkerError, WorkerJobRequest, WorkerResult, WorkerSheet, WorkerWarning

log = logging.getLogger(__name__)
logging.getLogger("matplotlib").setLevel(logging.ERROR)

ProgressFn = Callable[..., None]
PutArtifactFn = Callable[[str, bytes, str], None]
DownloadFn = Callable[[str, Path], Path]

_LEGEND_RX = re.compile(r"(?i)מקרא|legend")


def _is_legend_pdf(wf_name: str) -> bool:
    return bool(_LEGEND_RX.search(wf_name)) or "מקרא" in wf_name


def detect_file_kind(path: Path) -> str:
    with path.open("rb") as f:
        head = f.read(8)
    if head.startswith(b"%PDF"):
        return "pdf"
    if head[:4] == b"AC10":
        return "dwg"
    text = head.decode("latin-1", errors="ignore")
    if "SECTION" in text or path.suffix.lower() == ".dxf":
        return "dxf"
    return "unknown"


def _import_pdf_engine() -> type[PdfEngine]:
    from takeoff_worker.pdf_engine.engine import PdfVectorEngine

    return PdfVectorEngine


def _import_dwg_engine() -> type[DwgEngine]:
    from takeoff_worker.dwg_engine.engine import DwgEngine

    return DwgEngine


def _pct(base: float, span: float, local: float) -> float:
    return base + span * max(0.0, min(1.0, local))


def run_job(
    request: WorkerJobRequest,
    workdir: Path,
    progress: ProgressFn,
    put_artifact: PutArtifactFn,
    download: DownloadFn,
    *,
    pdf_engine: Optional[PdfEngine] = None,
    dwg_engine: Optional[DwgEngine] = None,
) -> WorkerResult:
    t0 = time.perf_counter()
    timings: dict[str, float] = {}

    def prog(stage: str, pct: float, msg: str | None = None, *, file_id: str | None = None, sheet_key: str | None = None) -> None:
        try:
            progress(stage, pct, msg, file_id=file_id, sheet_key=sheet_key)
        except TypeError:
            progress(stage, pct, msg)

    started = datetime.now(timezone.utc).isoformat()
    prog("downloading", 2, "הורדת קבצים")

    workdir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    errors: list[WorkerError] = []
    warnings: list[WorkerWarning] = []
    engine_versions: dict[str, str] = {}
    artifacts: dict[str, bytes] = {}

    for wf in request.files:
        dest = workdir / f"{wf.fileId}_{wf.name}"
        try:
            paths[wf.fileId] = download(wf.downloadUrl, dest)
        except OSError as exc:
            errors.append(WorkerError(code="download_failed", message=str(exc), fileId=wf.fileId))
    timings["download"] = time.perf_counter() - t0

    if pdf_engine is None or dwg_engine is None:
        try:
            if pdf_engine is None:
                pdf_engine = _import_pdf_engine()()
            if dwg_engine is None:
                dwg_engine = _import_dwg_engine()()
        except ImportError:
            if request.files and not errors:
                errors.append(WorkerError(code="engine_missing", message="PDF/DWG engines not installed (dev)"))

    sheet_keys = {(s.fileId, s.sheetKey) for s in request.sheetSelection} if request.sheetSelection else None
    outputs: dict[str, EngineOutput] = {}
    legend_templates: list[LegendTemplate] = []
    extract_stats: dict[str, float] = {}

    pdfs = sorted([f for f in request.files if f.kind == "pdf"], key=lambda f: (0 if _is_legend_pdf(f.name) else 1, f.name))
    others = [f for f in request.files if f.kind != "pdf"]
    ordered = pdfs + sorted(others, key=lambda f: f.name)

    t_extract = time.perf_counter()
    prog("legend", 8, "ניתוח קבצים")
    try:
        from takeoff_worker.pdf_engine.legend import build_legend_templates
    except ImportError:
        from takeoff_worker.pdf_engine.engine import templates_from_output as build_legend_templates  # type: ignore

    for fi, wf in enumerate(ordered):
        path = paths.get(wf.fileId)
        if not path:
            continue
        sk = None
        if sheet_keys:
            sk = {k for fid, k in sheet_keys if fid == wf.fileId}
        file_base = _pct(10, 58, fi / max(len(ordered), 1))
        t_file = time.perf_counter()
        try:
            if wf.kind == "pdf" and pdf_engine:
                prog("extract", file_base, f"PDF {wf.name}", file_id=wf.fileId)
                out = pdf_engine.analyze(
                    str(path),
                    wf.fileId,
                    options=request.options,
                    library=request.symbolLibrary,
                    extra_templates=legend_templates or None,
                    sheet_keys=sk,
                    progress=lambda st, pct, msg: prog("extract", _pct(file_base, 12, pct / 100), msg, file_id=wf.fileId),
                )
                outputs[wf.fileId] = out
                engine_versions.update(out.versions)
                for name, data in out.artifacts.items():
                    artifacts[name] = data
                    if request.options.renderPreview:
                        put_artifact(name, data, "image/png")
                if out.legend or _is_legend_pdf(wf.name):
                    added = build_legend_templates(out)
                    if added:
                        legend_templates.extend(added)
                        log.info("legend templates from %s: %s (total %s)", wf.fileId, len(added), len(legend_templates))
            elif wf.kind in ("dwg", "dxf") and dwg_engine:
                prog("extract", file_base, f"DWG {wf.name}", file_id=wf.fileId)
                xref_paths = {}
                for xr in wf.xrefs:
                    try:
                        xp = download(xr.downloadUrl, workdir / f"xr_{wf.fileId}_{xr.name}")
                        xref_paths[xr.name] = str(xp)
                    except OSError:
                        warnings.append(
                            WorkerWarning(code="xref_missing", severity="warning", message=f"xref חסר: {xr.name}", fileId=wf.fileId)
                        )
                out = dwg_engine.analyze(
                    str(path),
                    wf.fileId,
                    kind=wf.kind,
                    xref_paths=xref_paths,
                    options=request.options,
                    library=request.symbolLibrary,
                    sheet_keys=sk,
                    progress=lambda st, pct, msg: prog("extract", _pct(file_base, 12, pct / 100), msg, file_id=wf.fileId),
                )
                outputs[wf.fileId] = out
                engine_versions.update(out.versions)
                for name, data in out.artifacts.items():
                    artifacts[name] = data
                    if request.options.renderPreview:
                        put_artifact(name, data, "image/png")
        except Exception as exc:  # noqa: BLE001
            log.exception("file failed %s", wf.fileId)
            errors.append(WorkerError(code="file_failed", message=str(exc), fileId=wf.fileId))
        finally:
            extract_stats[f"timing_extract_{wf.fileId}_sec"] = time.perf_counter() - t_file
    timings["extract"] = time.perf_counter() - t_extract

    sheets: list[WorkerSheet] = []
    detections: list[WorkerDetection] = []
    legend = []
    linear = []
    for out in outputs.values():
        sheets.extend(out.sheets)
        detections.extend(out.detections)
        legend.extend(out.legend)
        linear.extend(out.linear)
        warnings.extend(out.warnings)

    dwg_legend = [e for e in legend if e.signatureKind == "dwg-block" or (e.key or "").startswith("block:")]
    legend = integrate_pdf_legend_templates(
        legend,
        legend_templates,
        catalog=request.catalog,
        dwg_legend=dwg_legend,
    )
    attach_mask_artifacts(detections, artifacts)

    t_classify = time.perf_counter()
    prog("classify", 72, "סיווג")
    catalog = request.catalog
    pre_classify = [d.model_copy(deep=True) for d in detections]
    sym_groups = 0
    try:
        ai_rows: dict[int, list] = {}
        if request.options.useAi:
            try:
                from .ai.legend_reader import NullReader

                ai_reader = get_legend_reader(True)
                if isinstance(ai_reader, NullReader):
                    warnings.append(
                        WorkerWarning(
                            code="ai_unavailable",
                            severity="warning",
                            message="AI legend reader unavailable (TAKEOFF_AI_* unset or useAi without provider)",
                        )
                    )
                ai_rows = ai_rows_for_legend(legend, artifacts, ai_reader) or {}
            except Exception as exc:  # noqa: BLE001
                log.exception("ai legend enrich failed")
                warnings.append(WorkerWarning(code="ai_failed", severity="warning", message=str(exc)))
        legend = classify_legend_entries(legend, catalog, ai_rows=ai_rows or None)
        detections = classify_detections(detections, catalog=catalog, library=request.symbolLibrary, legend=legend)
        sym_groups = assign_symbol_group_labels(detections)
    except Exception as exc:  # noqa: BLE001
        log.exception("classify stage failed")
        detections = pre_classify
        warnings.append(WorkerWarning(code="classify_failed", severity="warning", message=str(exc)))

    classified_n = sum(1 for d in detections if d.typeKey)
    plan_dets = [d for d in detections if "legend_zone" not in d.reasons]
    classified_high = sum(1 for d in plan_dets if d.typeKey and d.confidence == "high")
    unclassified_plan = sum(1 for d in plan_dets if not d.typeKey)
    legend_text_usable = sum(
        1 for e in legend if e.decodedText and "legend_text_undecodable" not in (e.reasons or [])
    )
    legend_text_undecodable = sum(1 for e in legend if "legend_text_undecodable" in (e.reasons or []))
    timings["classify"] = time.perf_counter() - t_classify
    prog("classify", 78, f"סווגו {classified_n}/{len(detections)}")

    t_merge = time.perf_counter()
    prog("merge", 82, "מיזוג PDF/DWG")
    stats: dict[str, float] = {
        "timing_download_sec": timings["download"],
        "timing_extract_sec": timings["extract"],
        "timing_classify_sec": timings["classify"],
        "classified_count": float(classified_n),
        "detection_count": float(len(detections)),
        "legend_template_count": float(len(legend_templates)),
        "symbol_group_count": float(sym_groups),
        "classified_high_count": float(classified_high),
        "unclassified_plan_count": float(unclassified_plan),
        "legend_text_usable": float(legend_text_usable),
        "legend_text_undecodable_count": float(legend_text_undecodable),
        "legend_rows_classified": float(sum(1 for e in legend if e.typeKey)),
        "plan_quantity_detections": float(len(plan_dets)),
        **extract_stats,
    }

    pairing = request.pairing or []
    if pairing:
        by_file: dict[str, list[WorkerDetection]] = defaultdict(list)
        sheets_by_file: dict[str, list[WorkerSheet]] = defaultdict(list)
        for d in detections:
            by_file[d.fileId].append(d)
        for s in sheets:
            sheets_by_file[s.fileId].append(s)

        merged_all: list[WorkerDetection] = []
        consumed: set[str] = set()

        pdf_name_by_id = {f.fileId: f.name for f in request.files}

        for pair in pairing:
            pdf_id, dwg_id = pair.pdfFileId, pair.dwgFileId
            pdf_sheets = [s for s in sheets_by_file.get(pdf_id, []) if s.kind == "pdf_page"]
            dwg_sheets = [s for s in sheets_by_file.get(dwg_id, []) if s.kind.startswith("dwg")]
            if not pdf_sheets:
                continue
            dwg_by_sheet = index_dwg_by_sheet(by_file.get(dwg_id, []), dwg_id)
            for pdf_sheet in pdf_sheets:
                pdf_dets = [d for d in filter_detections(by_file.get(pdf_id, []), pdf_sheet) if d.source == "pdf"]
                dwg_sheet, pick_how = pick_dwg_sheet_for_pdf(
                    pdf_sheet,
                    dwg_sheets,
                    pdf_file_name=pdf_name_by_id.get(pdf_id),
                    pdf_detections=pdf_dets,
                    dwg_detections_by_sheet=dwg_by_sheet,
                )
                if dwg_sheet is None:
                    continue
                prog(
                    "merge",
                    86,
                    f"מיזוג {pdf_name_by_id.get(pdf_id, pdf_sheet.name)} ↔ {dwg_sheet.name} ({pick_how})",
                    file_id=pdf_id,
                    sheet_key=pdf_sheet.sheetKey,
                )
                dwg_dets = [d for d in filter_detections(by_file.get(dwg_id, []), dwg_sheet) if d.source == "dwg"]
                if not pdf_dets and not dwg_dets:
                    continue
                if not pdf_dets:
                    warnings.append(
                        WorkerWarning(
                            code="merge_skipped",
                            severity="warning",
                            message=f"מיזוג PDF/DWG דולג — אין זיהויי PDF בגיליון {pdf_sheet.name}",
                            fileId=pdf_id,
                            sheetKey=pdf_sheet.sheetKey,
                        )
                    )
                    continue
                try:
                    merged, merge_warn, merge_stats = merge_pdf_dwg_pair(
                        pdf_dets,
                        dwg_dets,
                        pdf_sheet,
                        dwg_sheet=dwg_sheet,
                        dwg_source_path=str(paths.get(dwg_id)) if dwg_id in paths else None,
                    )
                    merged_all.extend(merged)
                    warnings.extend(merge_warn)
                    stats.update({k if k.startswith("merge_") else f"merge_{k}": v for k, v in merge_stats.items()})
                    consumed.update(d.id for d in pdf_dets)
                    consumed.update(d.id for d in dwg_dets)
                except Exception as exc:  # noqa: BLE001
                    log.exception("merge failed %s", pdf_sheet.sheetKey)
                    warnings.append(
                        WorkerWarning(
                            code="merge_failed",
                            severity="warning",
                            message=str(exc),
                            fileId=pdf_id,
                            sheetKey=pdf_sheet.sheetKey,
                        )
                    )
                    merged_all.extend(d.model_copy(deep=True) for d in pdf_dets)
                    merged_all.extend(d.model_copy(deep=True) for d in dwg_dets)
                    consumed.update(d.id for d in pdf_dets)
                    consumed.update(d.id for d in dwg_dets)

        for d in detections:
            if d.id not in consumed:
                merged_all.append(d)
        detections = merged_all
    else:
        tagged, unpaired_warn = apply_unpaired_pdf_policy(detections, request.files)
        warnings.extend(unpaired_warn)
        if tagged:
            stats["boq_unpaired_pdf_tagged"] = float(tagged)

    try:
        detections, legend = apply_twin_voting(detections, legend, catalog)
        detections = calibrate_confidences(detections, legend)
    except Exception as exc:  # noqa: BLE001
        log.exception("post-merge refine failed")
        warnings.append(WorkerWarning(code="classify_failed", severity="warning", message=f"refine: {exc}"))

    classified_n = sum(1 for d in detections if d.typeKey)
    plan_dets_final = [d for d in detections if "legend_zone" not in d.reasons]
    stats["classified_count"] = float(classified_n)
    stats["classified_high_count"] = float(
        sum(1 for d in plan_dets_final if d.typeKey and d.confidence == "high")
    )
    stats["unclassified_plan_count"] = float(sum(1 for d in plan_dets_final if not d.typeKey))
    stats["plan_quantity_detections"] = float(len(plan_dets_final))
    stats["legend_rows_classified"] = float(sum(1 for e in legend if e.typeKey))
    stats.update(side_stats(detections))
    for k, v in top_type_table(detections).items():
        stats[f"type_top_{k}_pdf"] = v["pdf"]
        stats[f"type_top_{k}_dwg"] = v["dwg"]

    timings["merge"] = time.perf_counter() - t_merge
    stats["timing_merge_sec"] = timings["merge"]
    stats["timing_total_sec"] = time.perf_counter() - t0
    hidden_layers = sum(s.hiddenByLayers for s in sheets)
    stats.update(boq_count_summary(detections, hidden_layers=hidden_layers))

    finished = datetime.now(timezone.utc).isoformat()
    status = "failed" if errors and not sheets else ("partial" if errors else "succeeded")
    prog("done", 100, f"הושלם ({stats['timing_total_sec']:.0f}ש)")
    return WorkerResult(
        jobId=request.jobId,
        status=status,
        startedAtIso=started,
        finishedAtIso=finished,
        engineVersions=engine_versions,
        sheets=sheets,
        detections=detections,
        legend=legend,
        linear=linear,
        warnings=warnings,
        errors=errors,
        stats=stats,
    )