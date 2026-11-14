"""Mirror of domain/counting-policy.ts for pipeline stats (not authoritative for BOQ).

`boq_countable` and related keys are written to worker ``result.stats`` for telemetry
only. They count every worker detection that passes twin collapse / legend_zone /
pdf_only — **without** the app's default sheet inclusion rules (e.g. DWG
``layout:מקרא`` legend layouts excluded as non-installed devices). The authoritative
quantity total is always ``computeBoq`` in the Next.js app (``countedTotal``).
"""
from __future__ import annotations

from ..models import WorkerDetection

_ALWAYS = frozenset({"legend_zone"})


def is_countable(d: WorkerDetection) -> bool:
    if any(r in _ALWAYS for r in d.reasons):
        return False
    if "pdf_only" in d.reasons:
        return False
    return True


def boq_count_summary(detections: list[WorkerDetection], *, hidden_layers: int = 0) -> dict[str, float]:
    twin_seen: set[str] = set()
    twin_groups: dict[str, int] = {}
    counted = 0
    excl_legend = 0
    excl_pdf_only = 0
    counted_dwg = 0
    counted_pdf = 0
    for d in detections:
        if "legend_zone" in d.reasons:
            excl_legend += 1
            continue
        if "pdf_only" in d.reasons:
            excl_pdf_only += 1
            continue
        if d.twinId:
            twin_groups[d.twinId] = twin_groups.get(d.twinId, 0) + 1
            if d.twinId in twin_seen:
                continue
            twin_seen.add(d.twinId)
        counted += 1
        if d.source == "dwg":
            counted_dwg += 1
        elif d.source == "pdf":
            counted_pdf += 1
    twins_collapsed = sum(n - 1 for n in twin_groups.values() if n > 1)
    return {
        "boq_countable": float(counted),
        "boq_excluded_legend_zone": float(excl_legend),
        "boq_excluded_pdf_only": float(excl_pdf_only),
        "boq_hidden_layers_sheet": float(hidden_layers),
        "boq_counted_dwg": float(counted_dwg),
        "boq_counted_pdf": float(counted_pdf),
        "boq_twins_collapsed": float(twins_collapsed),
    }