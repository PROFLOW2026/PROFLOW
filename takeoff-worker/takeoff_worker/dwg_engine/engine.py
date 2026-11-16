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

from ..data.catalog_loader import load_default_catalog
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
from .detections import collect_layout_symbols, dedupe, raw_to_worker
from .doc_context import DocContext
from .exploded import find_exploded_symbols
from .legend import collect_drawing_legend_rows
from .legend_types import accepted_legend_rows, socket_bank_signatures, type_map_from_legend_rows
from .linear_extract import extract_linear
from .preview import render_viewport_png
from .rules import LayerRules
from .viewport import pick_sheet_viewport, region_around_points, regions_for_layout

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

        library_map: dict[str, tuple[str, str]] = {}
        for entry in library:
            if entry.signatureKind != "dwg-block" or not entry.signature:
                continue
            pair = (entry.typeKey, (entry.geometryHash or "").strip())
            library_map[entry.signature] = pair
            library_map[entry.signature.lower()] = pair

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

            try:
                catalog = load_default_catalog()
            except FileNotFoundError:
                catalog = []
            collected_rows = collect_drawing_legend_rows(ctx)
            legend_rows = accepted_legend_rows(collected_rows, catalog)
            legend_types = type_map_from_legend_rows(legend_rows, catalog)
            bank_sigs = socket_bank_signatures(legend_rows)
            legend_names: set[str] = set()
            anchors: list[tuple[float, float]] = []
            # A note column is not a legend, but its symbols stay out of the count.
            for row in collected_rows:
                if not (row.get("rawText") or row.get("decodedText")):
                    continue
                if row.get("resolved"):
                    legend_names.add(str(row["resolved"]).lower())
                if row.get("blockName"):
                    legend_names.add(str(row["blockName"]).lower())
                if row.get("x") is not None and row.get("y") is not None:
                    anchors.append((float(row["x"]), float(row["y"])))

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
            # A default Layout1 viewport often contains extra copies of the model.
            # When the drawing also has a named issued sheet, count that sheet only.
            issued = [n for n in plan_layouts if n.casefold() not in {"layout1", "layout"}]
            if issued:
                plan_layouts = issued

            index = 0
            det_seq = 0
            n_layouts = len(plan_layouts)
            # One model insert shown on two layouts is one device.
            seen_model: set[tuple] = set()
            issued_regions = [regions_for_layout(ctx.doc, name) for name in plan_layouts]
            outside_open = True

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
                        vis, hidden, dup_extra = collect_layout_symbols(
                            ctx,
                            [reg],
                            xref_missing=missing_xrefs,
                            layout_name=lname,
                            legend_names=legend_names,
                        )
                        xref_extra = collect_merged_xref_inserts(
                            ctx, xref_docs, reg, layout_name=lname
                        )
                        if xref_extra:
                            vis, xref_dups = dedupe(vis + xref_extra)
                            dup_extra += xref_dups
                        measure_reg = reg
                    else:
                        regs = issued_regions[i] if i < len(issued_regions) else regions_for_layout(ctx.doc, lname)
                        primary = pick_sheet_viewport(regs, ctx)
                        if primary is None:
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
                        all_regions = [reg for group in issued_regions for reg in group]
                        vis, hidden, dup_extra = collect_layout_symbols(
                            ctx,
                            regs,
                            all_regs=all_regions,
                            xref_missing=missing_xrefs,
                            layout_name=lname,
                            legend_names=legend_names,
                            include_outside=outside_open,
                        )
                        outside_open = False
                        reg = region_around_points(
                            [(row.x, row.y) for row in vis],
                            layout_name=lname,
                            fallback=primary,
                        ) or primary
                        xref_extra = collect_merged_xref_inserts(
                            ctx, xref_docs, reg, layout_name=lname
                        )
                        if xref_extra:
                            vis, xref_dups = dedupe(vis + xref_extra)
                            dup_extra += xref_dups
                        measure_reg = primary

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
                        else find_exploded_symbols(ctx, measure_reg, layout_name=lname)
                    )
                    vis = vis + exploded
                    vis = [r for r in vis if not _is_legend_anchor(r.x, r.y, anchors)]

                    analyzed = "full"
                    if sheet_has_missing_xref_content(ctx, reg, missing_xrefs, lname):
                        analyzed = "partial"

                    for raw in vis:
                        model_key = (raw.resolved, round(raw.x, 1), round(raw.y, 1))
                        if model_key in seen_model:
                            continue
                        seen_model.add(model_key)
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
                            legend_types=legend_types,
                        )
                        # A socket bank has no catalog type until someone counts it.
                        # Do not multiply the insert by an assumed number of sockets.
                        if d["typeKey"] is None and (
                            d["signature"] in bank_sigs or d["signature"].lower() in bank_sigs
                        ):
                            d["classifiedBy"] = "none"
                            d["confidence"] = "none"
                            if "unclassified" not in d["reasons"]:
                                d["reasons"].append("unclassified")
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
                        measure_reg,
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
            legend_entries = self._build_legend(
                file_id, legend_rows, legend_types, block_counts, bank_sigs
            )

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
        file_id: str,
        rows: list[dict],
        legend_types: dict[str, tuple[str, str]],
        block_counts: Counter,
        bank_sigs: set[str] | None = None,
    ) -> list[WorkerLegendEntry]:
        bank_sigs = bank_sigs or set()
        out: list[WorkerLegendEntry] = []
        for row in rows:
            sig = row["signature"]
            hit = legend_types.get(sig) or legend_types.get(sig.lower())
            is_bank = sig in bank_sigs or sig.lower() in bank_sigs
            out.append(
                WorkerLegendEntry(
                    key=sig,
                    fileId=file_id,
                    sheetKey=row.get("sheetKey") or "model",
                    rowIndex=row.get("rowIndex"),
                    rawText=row.get("rawText"),
                    decodedText=row.get("decodedText"),
                    decodedBy=row.get("decodedBy") if row.get("decodedBy") != "none" else None,
                    signature=sig,
                    signatureKind="dwg-block",
                    count=int(block_counts.get(sig, 0)),
                    typeKey=hit[0] if hit else None,
                    confidence=hit[1] if hit else ("none" if is_bank else None),
                    reasons=["unclassified"] if is_bank and not hit else [],
                )
            )
        return out


def _is_legend_anchor(x: float, y: float, anchors: list[tuple[float, float]]) -> bool:
    for ax, ay in anchors:
        if abs(x - ax) <= 12.0 and abs(y - ay) <= 12.0:
            return True
    return False


def corpus_7155_path() -> str | None:
    dl = Path(os.environ.get("TAKEOFF_CORPUS", r"C:\Users\ERAN YOSEF\Downloads"))
    hits = glob.glob(str(dl / "FW__*" / "*" / "*" / "7155-A1 - Standard" / "7155-A1.dwg"))
    if hits:
        return hits[0]
    hits = glob.glob(str(dl / "**" / "7155-A1.dwg"), recursive=True)
    return hits[0] if hits else None