"""DwgEngine — implements takeoff_worker.engine_api.DwgEngine protocol."""
from __future__ import annotations

import glob
import logging
import os
import shutil
import tempfile
import time
from collections import Counter
from pathlib import Path

import ezdxf

from ..engine_api import EngineOutput, ProgressFn
from ..models import (
    JobOptions,
    Native,
    SheetScale,
    SymbolLibraryEntry,
    WorkerDetection,
    WorkerLegendEntry,
    WorkerLinear,
    WorkerSheet,
    WorkerWarning,
    XrefMissing,
)
from .blocks import is_xref_block
from .convert import convert_dwg_to_dxf, find_dwg2dxf
from .corpus_cache import ensure_dxf
from .xref_merge import collect_merged_xref_inserts, sheet_has_missing_xref_content
from .detections import collect_sheet_inserts, raw_to_worker
from .doc_context import DocContext
from .exploded import find_exploded_symbols
from .legend import find_legend_layout, legend_viewport_region, pair_legend_rows
from .linear_extract import extract_linear
from .preview import render_viewport_png
from .rules import LayerRules
from .viewport import pick_sheet_viewport, regions_for_layout

log = logging.getLogger(__name__)

class DwgEngine:
    def __init__(self, rules: LayerRules | None = None):
        self.rules = rules or LayerRules()

    def analyze(
        self,
        path: str,
        file_id: str,
        *,
        kind: str,
        xref_paths: dict[str, str],
        options: JobOptions,
        library: list[SymbolLibraryEntry],
        sheet_keys: set[str] | None = None,
        progress: ProgressFn | None = None,
    ) -> EngineOutput:
        t0 = time.perf_counter()
        tmp = tempfile.mkdtemp(prefix="takeoff_dwg_job_")
        warnings: list[WorkerWarning] = []
        stats: dict[str, float] = {}
        versions: dict[str, str] = {"ezdxf": ezdxf.__version__}
        exe = find_dwg2dxf()
        versions["libredwg"] = str(exe) if exe else "not_found"

        library_map = {
            e.signature: e.typeKey
            for e in library
            if e.signatureKind == "dwg-block" and e.signature
        }

        dxf_path = path
        cleanup_dxf = False
        try:
            if kind == "dwg":
                if progress:
                    progress("detect_type", 5, "Converting DWG to DXF")
                try:
                    dxf_cached, conv, cache_hit = ensure_dxf(path)
                    dxf_path = str(dxf_cached)
                    cleanup_dxf = False
                    stats["dwg_convert_secs"] = float(conv.convert_secs if conv else 0)
                    stats["dwg_convert_cache_hit"] = 1.0 if cache_hit else 0.0
                    if conv and conv.unstable_objects:
                        warnings.append(
                            WorkerWarning(
                                code="dwg_unstable_objects",
                                severity="warning",
                                message=f"LibreDWG reported {conv.unstable_objects} unstable object(s) during conversion",
                                fileId=file_id,
                            )
                        )
                        stats["dwg_unstable_objects"] = float(conv.unstable_objects)
                except Exception as ex:
                    warnings.append(
                        WorkerWarning(
                            code="dwg_convert_failed",
                            severity="error",
                            message=str(ex)[:500],
                            fileId=file_id,
                        )
                    )
                    return EngineOutput(
                        warnings=warnings,
                        versions=versions,
                        stats=stats,
                    )
            elif kind != "dxf":
                warnings.append(
                    WorkerWarning(
                        code="file_type_unsupported",
                        severity="error",
                        message=f"Unsupported kind {kind}",
                        fileId=file_id,
                    )
                )
                return EngineOutput(warnings=warnings, versions=versions)

            if progress:
                progress("sheets", 15, "Loading DXF")
            src = Path(path)
            size_mb = src.stat().st_size / (1024 * 1024) if src.is_file() else 0.0
            stats["dwg_file_mb"] = size_mb
            max_mb = float(os.environ.get("TAKEOFF_DWG_MAX_MB", "150"))
            if size_mb > max_mb:
                warnings.append(
                    WorkerWarning(
                        code="dwg_large_file",
                        severity="warning",
                        message=f"DWG/DXF file is large ({size_mb:.0f} MB > budget {max_mb:.0f} MB); analysis may be slow",
                        fileId=file_id,
                    )
                )
            ctx = DocContext(dxf_path, self.rules)
            stats["load_secs"] = ctx.load_secs
            stats["insert_candidates"] = float(len(ctx.inserts))
            max_ins = int(os.environ.get("TAKEOFF_DWG_MAX_INSERTS", "50000"))
            if len(ctx.inserts) > max_ins:
                warnings.append(
                    WorkerWarning(
                        code="dwg_insert_budget",
                        severity="warning",
                        message=f"{len(ctx.inserts)} INSERT candidates exceeds budget {max_ins}",
                        fileId=file_id,
                    )
                )

            loaded_xrefs, xref_docs = self._load_xrefs(xref_paths, warnings, file_id)
            missing_xrefs = self._missing_xrefs(ctx, loaded_xrefs, warnings, file_id)

            sheets_out: list[WorkerSheet] = []
            detections: list[WorkerDetection] = []
            linear: list[WorkerLinear] = []
            artifacts: dict[str, bytes] = {}
            block_counts: Counter = Counter()

            layout_names = [
                lay.name
                for lay in ctx.doc.layouts
                if lay.name != "Model" and regions_for_layout(ctx.doc, lay.name)
            ]
            if not layout_names:
                layout_names = ["Model"]

            plan_layouts = [n for n in layout_names if n != "Model"]
            if not plan_layouts:
                plan_layouts = ["Model"]

            index = 0
            det_seq = 0
            n_layouts = len(plan_layouts)

            for i, lname in enumerate(plan_layouts):
                sheet_key = f"layout:{lname}" if lname != "Model" else "model"
                if sheet_keys and sheet_key not in sheet_keys:
                    continue
                pct = 20 + 60 * (i / max(n_layouts, 1))
                if progress:
                    progress("extract", pct, f"Sheet {lname}")

                try:
                    if lname == "Model":
                        from .viewport import ViewportRegion

                        msp = ctx.doc.modelspace()
                        try:
                            ext = ezdxf.bbox.extents(msp)
                            if ext.has_data:
                                cx = (ext.extmin.x + ext.extmax.x) / 2
                                cy = (ext.extmin.y + ext.extmax.y) / 2
                                hw = (ext.extmax.x - ext.extmin.x) / 2 or 1.0
                                hh = (ext.extmax.y - ext.extmin.y) / 2 or 1.0
                            else:
                                cx = cy = 0.0
                                hw = hh = 1000.0
                        except Exception:
                            cx = cy = 0.0
                            hw = hh = 1000.0
                        reg = ViewportRegion(
                            layout_name="Model",
                            cx=cx,
                            cy=cy,
                            hw=hw,
                            hh=hh,
                            frozen_layers=set(),
                            twist_deg=0.0,
                            paper_width=1000.0,
                            paper_height=1000.0,
                            view_height=2 * hh,
                        )
                    else:
                        regs = regions_for_layout(ctx.doc, lname)
                        reg = pick_sheet_viewport(regs, ctx)
                        if reg is None:
                            sheets_out.append(
                                WorkerSheet(
                                    sheetKey=sheet_key,
                                    fileId=file_id,
                                    name=lname,
                                    kind="dwg_layout",
                                    index=index,
                                    widthPx=100,
                                    heightPx=100,
                                    analyzed="skipped",
                                    note="לא נמצא viewport תקין",
                                )
                            )
                            index += 1
                            continue

                    png_bytes = b""
                    width_px, height_px = 800, 600
                    note = ""
                    preview_name = None
                    if options.renderPreview:
                        png_bytes, width_px, height_px, note = render_viewport_png(
                            ctx, reg, max_edge=options.previewMaxEdgePx
                        )
                        preview_name = f"{file_id}_{sheet_key.replace(':', '_')}.png"
                        artifacts[preview_name] = png_bytes
                    scale = self._sheet_scale(ctx, reg, height_px)

                    xref_extra = collect_merged_xref_inserts(
                        ctx, xref_docs, reg, layout_name=lname
                    )
                    vis, hidden, dup_extra = collect_sheet_inserts(
                        ctx,
                        reg,
                        xref_missing=missing_xrefs,
                        layout_name=lname,
                        extra=xref_extra,
                    )
                    if dup_extra:
                        warnings.append(
                            WorkerWarning(
                                code="possible_duplicate",
                                severity="info",
                                message=f"Collapsed {dup_extra} stacked duplicate insert(s) on {lname}",
                                fileId=file_id,
                                sheetKey=sheet_key,
                            )
                        )
                        stats[f"dup_extra_{sheet_key}"] = float(dup_extra)

                    exploded = (
                        []
                        if self.rules.is_panel_layout(lname)
                        else find_exploded_symbols(ctx, reg, layout_name=lname)
                    )
                    vis = vis + exploded

                    analyzed = "full"
                    if sheet_has_missing_xref_content(ctx, reg, missing_xrefs, lname):
                        analyzed = "partial"

                    for raw in vis:
                        det_seq += 1
                        d = raw_to_worker(
                            raw,
                            sheet_key=sheet_key,
                            file_id=file_id,
                            seq=det_seq,
                            reg=reg,
                            width_px=width_px,
                            height_px=height_px,
                            library_map=library_map,
                        )
                        det = WorkerDetection(**d)
                        if "xref_missing" in det.reasons and analyzed != "partial":
                            analyzed = "partial"
                        detections.append(det)
                        sig = d["signature"]
                        block_counts[sig] += 1

                    mpp = None
                    if scale.verified and scale.metersPerPreviewPx:
                        mpp = scale.metersPerPreviewPx
                    lin_rows = extract_linear(
                        ctx,
                        reg,
                        sheet_key=sheet_key,
                        file_id=file_id,
                        width_px=width_px,
                        height_px=height_px,
                        scale_verified=scale.verified,
                        meters_per_preview_px=mpp,
                        start_id=det_seq + 1,
                    )
                    for row in lin_rows:
                        linear.append(WorkerLinear(**row))

                    xrefs_missing = [XrefMissing(name=n) for n in sorted(missing_xrefs)]
                    if analyzed == "partial":
                        warnings.append(
                            WorkerWarning(
                                code="xref_missing",
                                severity="warning",
                                message=f"Sheet '{lname}' includes content on missing xref layer(s)",
                                fileId=file_id,
                                sheetKey=sheet_key,
                            )
                        )

                    sheets_out.append(
                        WorkerSheet(
                            sheetKey=sheet_key,
                            fileId=file_id,
                            name=lname,
                            kind="dwg_model" if lname == "Model" else "dwg_layout",
                            index=index,
                            widthPx=width_px,
                            heightPx=height_px,
                            previewArtifact=preview_name,
                            scale=scale,
                            analyzed=analyzed,
                            note=note,
                            xrefsMissing=xrefs_missing,
                            hiddenByLayers=hidden,
                        )
                    )
                    index += 1
                except Exception as ex:
                    log.exception("sheet failed %s", lname)
                    warnings.append(
                        WorkerWarning(
                            code="sheet_partial",
                            severity="warning",
                            message=f"{lname}: {ex}"[:400],
                            fileId=file_id,
                            sheetKey=sheet_key,
                        )
                    )
                    sheets_out.append(
                        WorkerSheet(
                            sheetKey=sheet_key,
                            fileId=file_id,
                            name=lname,
                            index=index,
                            kind="dwg_layout",
                            widthPx=100,
                            heightPx=100,
                            analyzed="partial",
                            note=str(ex)[:200],
                        )
                    )
                    index += 1

            if progress:
                progress("legend", 85, "Legend")
            legend_entries = self._build_legend(ctx, file_id, plan_layouts, block_counts, artifacts)

            stats["detections"] = float(len(detections))
            stats["analyze_secs"] = round(time.perf_counter() - t0, 3)

            return EngineOutput(
                sheets=sheets_out,
                detections=detections,
                legend=legend_entries,
                linear=linear,
                warnings=warnings,
                artifacts=artifacts,
                versions=versions,
                stats=stats,
            )
        finally:
            if os.path.isdir(tmp):
                shutil.rmtree(tmp, ignore_errors=True)

    def _sheet_scale(self, ctx: DocContext, reg, height_px: int) -> SheetScale:
        if ctx.meters_per_unit is None:
            return SheetScale(verified=False, source="none", note="INSUNITS לא מוגדר")
        model_h = 2 * reg.hh
        if model_h <= 0 or height_px <= 0:
            return SheetScale(verified=False, source="none", note="גובה viewport לא תקין")
        if abs(reg.view_height - model_h) > model_h * 0.02:
            return SheetScale(
                verified=False,
                source="none",
                note="scale_unverified: viewport view_height mismatch",
            )
        mppx = (model_h * ctx.meters_per_unit) / height_px
        return SheetScale(
            ratio=None,
            metersPerPreviewPx=mppx,
            verified=True,
            source="insunits",
            note="insunits + viewport",
        )

    def _load_xrefs(
        self, xref_paths: dict[str, str], warnings: list[WorkerWarning], file_id: str
    ) -> tuple[set[str], dict[str, DocContext]]:
        loaded: set[str] = set()
        docs: dict[str, DocContext] = {}
        for name, xpath in xref_paths.items():
            if not os.path.isfile(xpath):
                continue
            try:
                dxf_p, _, _ = ensure_dxf(xpath)
                docs[name] = DocContext(str(dxf_p), self.rules)
                loaded.add(name)
            except Exception as ex:
                warnings.append(
                    WorkerWarning(
                        code="xref_missing",
                        severity="warning",
                        message=f"Xref {name}: load failed: {ex}"[:300],
                        fileId=file_id,
                    )
                )
        return loaded, docs

    def _missing_xrefs(
        self, ctx: DocContext, loaded: set[str], warnings: list[WorkerWarning], file_id: str
    ) -> set[str]:
        missing: set[str] = set()
        for xr in ctx.xrefs:
            n = xr["name"]
            if xr.get("inserted", 0) <= 0:
                continue
            if n not in loaded:
                missing.add(n)
                warnings.append(
                    WorkerWarning(
                        code="xref_missing",
                        severity="warning",
                        message=f"Xref '{n}' referenced but file not provided",
                        fileId=file_id,
                    )
                )
        return missing

    def _build_legend(
        self,
        ctx: DocContext,
        file_id: str,
        plan_layouts: list[str],
        block_counts: Counter,
        artifacts: dict[str, bytes],
    ) -> list[WorkerLegendEntry]:
        lay = find_legend_layout(ctx)
        if not lay:
            return []
        reg = legend_viewport_region(ctx, lay)
        if reg is None:
            return []
        rows = pair_legend_rows(ctx, reg)
        out: list[WorkerLegendEntry] = []
        for row in rows:
            sig = row["signature"]
            out.append(
                WorkerLegendEntry(
                    key=sig,
                    fileId=file_id,
                    sheetKey=f"layout:{lay}",
                    rowIndex=row.get("rowIndex"),
                    rawText=row.get("rawText"),
                    decodedText=row.get("decodedText"),
                    decodedBy=row.get("decodedBy") if row.get("decodedBy") != "none" else None,
                    signature=sig,
                    signatureKind="dwg-block",
                    count=int(block_counts.get(sig, 0)),
                )
            )
        return out


def corpus_7155_path() -> str | None:
    dl = Path(os.environ.get("TAKEOFF_CORPUS", r"C:\Users\ERAN YOSEF\Downloads"))
    hits = glob.glob(str(dl / "FW__*" / "*" / "*" / "7155-A1 - Standard" / "7155-A1.dwg"))
    if hits:
        return hits[0]
    hits = glob.glob(str(dl / "**" / "7155-A1.dwg"), recursive=True)
    return hits[0] if hits else None