"""Legend extraction + ``build_legend_templates`` for the pipeline (Agent 3)."""
from __future__ import annotations

import json
import os
from typing import Callable, Optional

import numpy as np

from takeoff_worker.engine_api import EngineOutput, LegendTemplate

from . import generic_ops as G
from . import shape_engine as E
from .geometry import PdfMatrix, PdfRect
from .hebrew import decode_pdf_text
from .masks import dominant_hex, mask_signature, mask_to_b64
from .templates import legend_template_from_comp

LEGEND_MARKERS = ("מקרא", "legend", "הסבר")


def is_legend_document(path: str) -> bool:
    base = os.path.basename(path).lower()
    return any(m in base for m in LEGEND_MARKERS)


def sort_legend_comps(comps: list[E.Comp]) -> list[E.Comp]:
    return sorted(comps, key=lambda c: ((c.rect.y0 + c.rect.y1) / 2, (c.rect.x0 + c.rect.x1) / 2))


def extract_legend_comps_fullpage(drawings: list[dict], M: PdfMatrix) -> list[E.Comp]:
    """7155-style legend PDF: all coloured symbol components on the page (research ``run7155.prep``)."""
    comps = E.build_components(drawings, M, G.colored_filter, tol=0.6, min_extent=3.0, max_extent=80.0)
    return sort_legend_comps(comps)


def extract_legend_comps_embedded(
    drawings: list[dict],
    M: PdfMatrix,
    page_size: tuple[float, float],
    hint: Optional[PdfRect] = None,
) -> tuple[list[E.Comp], Optional[PdfRect]]:
    """Legend on plan sheets (3643 / AS1749 / 4285): column detect + multi-colour cores."""
    from .legend_detect import auto_legend_components, filter_glyph_candidates

    w, h = page_size
    comps, found_rect = auto_legend_components(drawings, M, page_size, hint)
    sweep = G.core_components(
        drawings,
        M,
        PdfRect(w * 0.02, h * 0.02, w * 0.98, h * 0.98),
        min_ext=4.0,
        max_ext=65.0,
        merge_small_tol=2.0,
    )
    from .legend_zone import _margin_legend_comps

    margin = _margin_legend_comps(sweep, w, h)
    bottom_left = [
        c
        for c in sweep
        if (c.rect.x0 + c.rect.x1) / 2 < w * 0.24
        and (c.rect.y0 + c.rect.y1) / 2 > h * 0.38
    ]
    if len(bottom_left) >= 25:
        mx = float(np.median([(c.rect.x0 + c.rect.x1) / 2 for c in bottom_left]))
        if mx < w * 0.22:
            comps = sort_legend_comps(bottom_left)
            found_rect = hint or found_rect
    elif len(margin) >= 8 and len(margin) > len(comps) and len(margin) <= 80:
        comps = sort_legend_comps(margin)
        found_rect = hint or found_rect
    elif len(comps) < 8:
        if len(margin) >= 8:
            comps = sort_legend_comps(margin)
            found_rect = hint
        else:
            region = hint or PdfRect(w * 0.05, h * 0.55, w * 0.95, h * 0.98)
            comps = G.core_components(drawings, M, region, min_ext=4.0, max_ext=55.0, merge_small_tol=2.0)
            if len(comps) > 150:
                comps = comps[:150]
            found_rect = region
    comps = filter_glyph_candidates(comps)
    table_rect: Optional[PdfRect] = None
    if comps:
        w, h = page_size
        margin = [
            c
            for c in comps
            if (c.rect.x0 + c.rect.x1) / 2 > w * 0.72
            and h * 0.08 < (c.rect.y0 + c.rect.y1) / 2 < h * 0.88
        ]
        if len(margin) >= 6:
            use = margin
        else:
            bottom = [c for c in comps if (c.rect.y0 + c.rect.y1) / 2 > h * 0.62]
            if len(bottom) >= 8:
                mx = float(np.median([(c.rect.x0 + c.rect.x1) / 2 for c in bottom]))
                my = float(np.median([(c.rect.y0 + c.rect.y1) / 2 for c in bottom]))
                use = bottom if mx < w * 0.55 or my > h * 0.78 else []
            else:
                use = []
        if use:
            x0 = min(c.rect.x0 for c in use)
            y0 = min(c.rect.y0 for c in use)
            x1 = max(c.rect.x1 for c in use)
            y1 = max(c.rect.y1 for c in use)
            table_rect = PdfRect(x0 - 6, y0 - 6, x1 + 6, y1 + 6)
    _ = found_rect  # search region is not a BOQ exclusion zone
    return sort_legend_comps(comps), table_rect


def legend_row_text_v2(words: list[dict], comp: E.Comp) -> tuple[Optional[str], Optional[str], Optional[str]]:
    cy = (comp.rect.y0 + comp.rect.y1) / 2
    band = max(comp.rect.height, 6.0) * 1.5
    near: list[tuple[float, str]] = []
    for w in words:
        if abs(w["cy"] - cy) > band:
            continue
        dx = min(abs(w["rect"].x0 - comp.rect.x1), abs(w["rect"].x1 - comp.rect.x0))
        if dx > max(comp.rect.width * 3, 80):
            continue
        near.append((dx, w.get("text") or ""))
    near.sort(key=lambda x: x[0])
    texts = [t.strip() for _, t in near if t.strip()]
    if not texts:
        return None, None, None
    raw = " ".join(texts)
    tag = texts[0] if texts and len(texts[0]) <= 12 else None
    decoded = decode_pdf_text(raw)
    decoded_by_he = decoded if decoded and decoded != raw else None
    return raw, decoded_by_he or None, tag


def build_legend_worker_entries(
    comps: list[E.Comp],
    words: list[dict],
    file_id: str,
    sheet_key: str,
    crop_fn: Callable[[E.Comp], bytes],
    *,
    chars: Optional[list[dict]] = None,
) -> tuple[list, list[LegendTemplate], dict[str, bytes], dict[str, float]]:
    """Returns (WorkerLegendEntry list placeholder via caller, templates, artifacts, stats floats)."""
    from takeoff_worker.models import LegendTextBox, WorkerLegendEntry
    from .legend_text import legend_row_text_chars

    rows: list[WorkerLegendEntry] = []
    templates: list[LegendTemplate] = []
    artifacts: dict[str, bytes] = {}
    stats: dict[str, float] = {}

    for i, comp in enumerate(comps):
        key = f"L{i + 1}"
        sig = mask_signature(comp.mask)
        art = f"legend-{sheet_key}-{i + 1}.png"
        artifacts[art] = crop_fn(comp)
        mask_b64 = mask_to_b64(comp.mask)
        artifacts[f"legend-mask-b64-{key}"] = mask_b64.encode("ascii")
        if chars:
            raw, decoded, tag, tbox, reasons = legend_row_text_chars(chars, comp, words=words)
        else:
            raw, decoded, tag = legend_row_text_v2(words, comp)
            tbox, reasons = None, []
        decoded_by = "pdf_text" if decoded else ("none" if not raw else "pdf_text")
        text_box = (
            LegendTextBox(x0=tbox.x0, y0=tbox.y0, x1=tbox.x1, y1=tbox.y1) if tbox is not None else None
        )
        rows.append(
            WorkerLegendEntry(
                key=key,
                fileId=file_id,
                sheetKey=sheet_key,
                rowIndex=i,
                rawText=raw or tag,
                decodedText=decoded,
                decodedBy=decoded_by,
                textBox=text_box,
                reasons=reasons,  # type: ignore[arg-type]
                signature=sig,
                signatureKind="pdf-shape",
                previewArtifact=art,
                typeKey=None,
                confidence=None,
            )
        )
        templates.append(
            legend_template_from_comp(key, comp, file_id, tag=tag, decoded=decoded)
        )
        stats[f"legend_radius_pt_{key}"] = float(comp.rad)
    stats["legend_text_usable"] = float(sum(1 for r in rows if r.decodedText))
    stats["legend_text_undecodable_count"] = float(
        sum(1 for r in rows if "legend_text_undecodable" in r.reasons)
    )
    if templates:
        payload = [
            dict(
                key=t.key,
                source_file_id=t.source_file_id,
                mask_b64=t.mask_b64,
                color_hex=t.color_hex,
                radius_pt=t.radius_pt,
                tag_text=t.tag_text,
                decoded_text=t.decoded_text,
            )
            for t in templates
        ]
        artifacts[f"legend-templates-{file_id}.json"] = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return rows, templates, artifacts, stats


def row_has_decodable_text(row) -> bool:
    if "legend_text_undecodable" in (row.reasons or []):
        return False
    return bool((row.decodedText or "").strip())


def templates_for_plan_matching(rows: list, comps: list) -> tuple[list[tuple[str, E.Comp]], int]:
    """Same-sheet plan templates: only legend rows with decodable text (no invented types)."""
    decodable_idx = [i for i, r in enumerate(rows) if row_has_decodable_text(r)]
    if not decodable_idx:
        return [], 0
    pairs = [(rows[i].key, comps[i]) for i in decodable_idx]
    return pairs, len(decodable_idx)


def plan_template_pairs(rows: list, comps: list) -> tuple[list[tuple[str, E.Comp]], int]:
    """Legend shapes used to group plan symbols.

    Decodable rows come first. Rows OCR could not read stay in the list so each
    matching symbol keeps a stable legend key for a later manual assignment.
    Type keys are not invented here.
    """
    embed, n_dec = templates_for_plan_matching(rows, comps)
    limit = min(len(rows), len(comps))
    all_pairs = [(rows[i].key, comps[i]) for i in range(limit)]
    if not embed:
        return all_pairs, n_dec
    seen = {key for key, _comp in embed}
    extra = [(key, comp) for key, comp in all_pairs if key not in seen]
    return embed + extra, n_dec


def build_legend_templates(output: EngineOutput) -> list[LegendTemplate]:
    """Primary API for Agent 3: masks + metadata from a legend-only (or legend-rich) ``EngineOutput``."""
    for name, data in output.artifacts.items():
        if name.startswith("legend-templates-") and name.endswith(".json"):
            try:
                payload = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            out: list[LegendTemplate] = []
            for row in payload:
                if row.get("mask_b64"):
                    out.append(LegendTemplate(**row))
            if out:
                return out
    templates: list[LegendTemplate] = []
    for entry in output.legend:
        mask_art = f"legend-mask-b64-{entry.key}"
        b64_bytes = output.artifacts.get(mask_art)
        if not b64_bytes:
            continue
        b64 = b64_bytes.decode("ascii")
        rad = output.stats.get(f"legend_radius_pt_{entry.key}")
        templates.append(
            LegendTemplate(
                key=entry.key,
                source_file_id=entry.fileId,
                mask_b64=b64,
                radius_pt=float(rad) if rad else None,
                tag_text=entry.rawText,
                decoded_text=entry.decodedText,
            )
        )
    return templates