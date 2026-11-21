"""Bridge PDF legend templates + DWG מקרא rows into classified legend keys for L* mapping."""
from __future__ import annotations

import re

from ..engine_api import LegendTemplate
from ..models import CatalogType, Confidence, WorkerLegendEntry
from .legend_map import match_legend_text

_BLOCK_RE = re.compile(r"(?i)^block:(.+)$")


def _looks_like_outline_tag(tag: str) -> bool:
    t = tag.strip()
    if not t:
        return True
    if len(t) <= 3 and t.isalnum():
        return True
    return False


def _block_from_legend_row(row: WorkerLegendEntry) -> str | None:
    if row.key:
        m = _BLOCK_RE.match(row.key.strip())
        if m:
            return m.group(1).lower()
        if row.signatureKind == "dwg-block":
            return row.key.strip().lower().replace("block:", "")
    sig = row.signature or ""
    if sig.lower().startswith("block:"):
        return sig[6:].lower()
    return None


def _dwg_block_index(dwg_legend: list[WorkerLegendEntry]) -> dict[str, WorkerLegendEntry]:
    out: dict[str, WorkerLegendEntry] = {}
    for row in dwg_legend:
        if row.typeKey is None:
            continue
        bn = _block_from_legend_row(row)
        if bn:
            out[bn] = row
        label = (row.decodedText or row.rawText or "").strip()
        if label:
            out[label.lower()] = row
    return out


def integrate_pdf_legend_templates(
    legend: list[WorkerLegendEntry],
    templates: list[LegendTemplate],
    *,
    catalog: list[CatalogType],
    dwg_legend: list[WorkerLegendEntry] | None = None,
) -> list[WorkerLegendEntry]:
    """Upsert / enrich legend rows from ``build_legend_templates`` output."""
    if not templates:
        return legend

    by_key = {e.key: e for e in legend}
    dwg_idx = _dwg_block_index(dwg_legend or [])

    for tpl in templates:
        row = by_key.get(tpl.key)
        undecodable = row is not None and "legend_text_undecodable" in row.reasons
        text = ""
        if not undecodable:
            text = tpl.decoded_text or ""
            if not text and tpl.tag_text and not _looks_like_outline_tag(tpl.tag_text):
                text = tpl.tag_text
        if row is None:
            row = WorkerLegendEntry(
                key=tpl.key,
                fileId=tpl.source_file_id,
                signature=f"legend:{tpl.key}",
                signatureKind="legend-key",
                rawText=tpl.tag_text,
                decodedText=tpl.decoded_text,
                decodedBy="pdf_text" if tpl.decoded_text else "none",
                typeKey=None,
                confidence=None,
            )
            legend.append(row)
            by_key[tpl.key] = row

        match = match_legend_text(text, catalog) if text else None
        if match:
            row.typeKey = match.type_key
            row.confidence = match.confidence
        elif tpl.tag_text:
            tag = tpl.tag_text.strip().lower()
            dwg_row = dwg_idx.get(tag)
            if dwg_row and dwg_row.typeKey:
                row.typeKey = dwg_row.typeKey
                row.confidence = _confidence_cap(dwg_row.confidence or "medium", "medium")
                row.decodedText = row.decodedText or dwg_row.decodedText or text
            elif tag.startswith("t") and tag[1:].isdigit():
                dwg_row = dwg_idx.get(f"t{tag[1:]}") or dwg_idx.get(tag[1:])
                if dwg_row and dwg_row.typeKey:
                    row.typeKey = dwg_row.typeKey
                    row.confidence = "medium"

        if row.typeKey is None and text:
            row.confidence = "low"
    return legend


def attach_mask_artifacts(
    detections: list,
    artifacts: dict[str, bytes],
) -> None:
    """Set optional maskB64 from engine artifacts ``{id}-mask.b64``."""
    for d in detections:
        art = artifacts.get(f"{d.id}-mask.b64")
        if art:
            try:
                d.maskB64 = art.decode("ascii")
            except Exception:
                pass
        elif d.legendKey:
            leg = artifacts.get(f"legend-mask-b64-{d.legendKey}")
            if leg:
                try:
                    d.maskB64 = leg.decode("ascii")
                except Exception:
                    pass


def _confidence_cap(a: Confidence | None, b: Confidence) -> Confidence:
    order: list[Confidence] = ["high", "medium", "low", "none"]
    if a is None:
        return b
    return order[min(order.index(a), order.index(b))]