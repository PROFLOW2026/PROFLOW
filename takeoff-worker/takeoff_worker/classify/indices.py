"""Indexes for legend rows -> detection lookups (signature, block, legend key)."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import Confidence, WorkerLegendEntry


@dataclass(frozen=True)
class TypeHint:
    type_key: str
    confidence: Confidence
    via: str


def _norm_block(name: str | None) -> str | None:
    if not name:
        return None
    n = name.strip().lower()
    if n.startswith("block:"):
        n = n[6:]
    return n or None


def build_legend_indices(legend: list[WorkerLegendEntry]) -> dict[str, dict[str, TypeHint]]:
    by_sig: dict[str, TypeHint] = {}
    by_block: dict[str, TypeHint] = {}
    by_key: dict[str, TypeHint] = {}
    conflict: set[str] = set()
    for row in legend:
        if not row.typeKey or not row.signature:
            continue
        previous = by_sig.get(row.signature)
        if previous is not None and previous.type_key != row.typeKey:
            conflict.add(row.signature)
            conflict.add(row.signature.lower())
    for row in legend:
        if not row.typeKey:
            continue
        if row.signature and (row.signature in conflict or row.signature.lower() in conflict):
            continue
        conf: Confidence = (
            row.confidence
            if row.confidence not in (None, "none")
            else "low"
        )
        hint = TypeHint(row.typeKey, conf, "legend_row")
        if row.signature:
            by_sig[row.signature] = hint
            by_sig[row.signature.lower()] = hint
        if row.key:
            by_key[row.key] = hint
            by_key[row.key.lower()] = hint
        if row.signatureKind == "dwg-block":
            bn = _norm_block(row.key) or _norm_block(row.signature)
            if bn and bn not in conflict:
                by_block[bn] = hint
    return {"signature": by_sig, "block": by_block, "key": by_key}


_LAYER_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)FIRE|שריפה|גילוי"), "fire.smoke_detector"),
    (re.compile(r"(?i)SW|מפסק"), "control.switch.single"),
    (re.compile(r"(?i)LIGHT|תאורה"), "light.recessed"),
    (re.compile(r"(?i)BEZEQ|DATA|תקשורת"), "comm.data"),
    (re.compile(r"שקע"), "power.socket.single"),
]


def layer_nudge_type(layer: str | None) -> TypeHint | None:
    if not layer:
        return None
    for rx, key in _LAYER_HINTS:
        if rx.search(layer):
            return TypeHint(key, "low", "layer_hint")
    return None


def combined_detection_text(det) -> str:
    parts = [det.blockName or "", det.rawClass or "", det.layer or "", det.tagText or ""]
    return " ".join(p for p in parts if p).strip()