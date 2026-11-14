"""Apply catalog, legend, library to engine outputs."""
from __future__ import annotations

import logging

from ..models import CatalogType, Confidence, SymbolLibraryEntry, WorkerDetection, WorkerLegendEntry
from .indices import TypeHint, build_legend_indices, combined_detection_text
from .legend_map import LegendMatch, match_legend_text
from .text_norm import normalize_legend_text

log = logging.getLogger(__name__)


def _planner_library_index(library: list[SymbolLibraryEntry]) -> dict[tuple[str, str], SymbolLibraryEntry]:
    out: dict[tuple[str, str], SymbolLibraryEntry] = {}
    for e in library:
        out[(e.signatureKind, e.signature)] = e
        out[(e.signatureKind, e.signature.lower())] = e
    return out


def _legend_match_text(row: WorkerLegendEntry) -> str:
    undecodable = "legend_text_undecodable" in row.reasons
    if undecodable and not row.decodedText:
        return ""
    if row.decodedBy == "dwg_kbd" and row.rawText:
        return normalize_legend_text(row.rawText, decoded_by="dwg_kbd")
    if row.decodedText:
        return normalize_legend_text(row.decodedText, decoded_by=row.decodedBy)
    if undecodable:
        return ""
    if row.rawText:
        return normalize_legend_text(row.rawText, decoded_by=row.decodedBy)
    return ""


def classify_legend_entries(
    entries: list[WorkerLegendEntry],
    catalog: list[CatalogType],
    *,
    ai_rows: dict[int, list] | None = None,
) -> list[WorkerLegendEntry]:
    result: list[WorkerLegendEntry] = []
    for row in entries:
        copy = row.model_copy(deep=True)
        text = _legend_match_text(row)
        if text:
            copy.decodedText = text

        match = match_legend_text(text, catalog) if text else None
        if ai_rows and row.rowIndex is not None and row.rowIndex in ai_rows:
            for ar in ai_rows[row.rowIndex]:
                if ar.suggested_type_key:
                    match = LegendMatch(ar.suggested_type_key, ar.confidence, 0.0)
                    break

        if match:
            copy.typeKey = match.type_key
            copy.confidence = match.confidence
            if match.ambiguous and copy.confidence != "low":
                copy.confidence = "low"
        else:
            copy.typeKey = None
            copy.confidence = "none" if "legend_text_undecodable" in copy.reasons else "low"
        result.append(copy)
    return result


AMBIGUOUS_GROUPS: list[frozenset[str]] = [
    frozenset({"light.recessed", "light.downlight", "light.surface"}),
    frozenset({"control.switch.single", "control.switch.two_way"}),
    frozenset({"power.socket.single", "power.socket.double", "power.socket.triple"}),
]


def _confidence_cap(a: Confidence, b: Confidence) -> Confidence:
    order: list[Confidence] = ["high", "medium", "low", "none"]
    return order[min(order.index(a), order.index(b))]


def _apply_hint(
    d: WorkerDetection,
    hint: TypeHint,
    classified_by: str,
) -> None:
    if d.typeKey is None:
        d.typeKey = hint.type_key
        d.classifiedBy = classified_by  # type: ignore[assignment]
        d.confidence = hint.confidence
    elif d.typeKey == hint.type_key:
        d.confidence = _confidence_cap(d.confidence, hint.confidence)
    else:
        if "type_ambiguous" not in d.reasons:
            d.reasons.append("type_ambiguous")
        d.confidence = "low"


def classify_detections(
    detections: list[WorkerDetection],
    *,
    catalog: list[CatalogType],
    library: list[SymbolLibraryEntry],
    legend: list[WorkerLegendEntry],
) -> list[WorkerDetection]:
    lib = _planner_library_index(library)
    indices = build_legend_indices(legend)

    out: list[WorkerDetection] = []
    for det in detections:
        d = det.model_copy(deep=True)
        reasons = list(d.reasons)
        engine_conf: Confidence | None = d.confidence if d.confidence != "none" else None
        if d.typeKey:
            engine_conf = engine_conf or d.confidence

        lib_hit = lib.get((d.signatureKind, d.signature)) or lib.get((d.signatureKind, d.signature.lower()))
        if lib_hit:
            d.typeKey = lib_hit.typeKey
            d.classifiedBy = "library"
            d.confidence = "high"
        else:
            if d.legendKey:
                h = indices["key"].get(d.legendKey) or indices["key"].get(d.legendKey.lower())
                if h:
                    _apply_hint(d, h, "legend_text")

            if d.typeKey is None:
                h = indices["signature"].get(d.signature) or indices["signature"].get(d.signature.lower())
                if h:
                    _apply_hint(d, h, "legend_text")

            if d.typeKey is None and d.blockName:
                bn = d.blockName.lower()
                h = indices["block"].get(bn)
                if h:
                    _apply_hint(d, h, "dwg_block_map")

            if d.typeKey is None and d.rawClass:
                rc = d.rawClass.lower().replace("block:", "")
                h = indices["block"].get(rc)
                if h:
                    _apply_hint(d, h, "dwg_block_map")

            if d.typeKey is None:
                blob = combined_detection_text(d)
                if blob:
                    match = match_legend_text(blob, catalog)
                    if match:
                        conf = match.confidence if not match.ambiguous else "low"
                        _apply_hint(
                            d,
                            TypeHint(match.type_key, conf, "catalog_text"),
                            "legend_text" if d.legendKey else "dwg_block_map",
                        )
                        if match.ambiguous and "type_ambiguous" not in d.reasons:
                            d.reasons.append("type_ambiguous")

            if d.typeKey is None and d.tagText:
                match = match_legend_text(d.tagText, catalog)
                if match:
                    _apply_hint(d, TypeHint(match.type_key, match.confidence, "tag"), "legend_text")

        if engine_conf and d.typeKey:
            d.confidence = _confidence_cap(d.confidence, engine_conf)

        if d.typeKey is None:
            d.classifiedBy = "none"
            d.confidence = "none"
            if "unclassified" not in reasons:
                reasons.append("unclassified")
        else:
            for group in AMBIGUOUS_GROUPS:
                if d.typeKey in group:
                    if "type_ambiguous" not in reasons:
                        reasons.append("type_ambiguous")
                    break
        if d.confidence in ("low", "none") and d.typeKey is not None:
            if "low_confidence" not in reasons:
                reasons.append("low_confidence")

        if d.typeKey is None and d.legendKey and "legend_unmapped" not in reasons:
            reasons.append("legend_unmapped")

        d.reasons = list(dict.fromkeys(reasons))
        out.append(d)
    return out