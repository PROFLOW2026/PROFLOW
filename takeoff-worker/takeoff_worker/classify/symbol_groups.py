"""Label unclassified plan symbols by shape signature for human review / library save."""
from __future__ import annotations

from collections import defaultdict

from ..models import WorkerDetection


_UNCLASSIFIED_LABEL = "סמל ללא סווג"


def assign_symbol_group_labels(detections: list[WorkerDetection]) -> int:
    """Set review ``tagText`` for unclassified non-legend detections; return group count."""
    buckets: dict[tuple[str, str, str], list[WorkerDetection]] = defaultdict(list)
    for d in detections:
        if d.typeKey is not None:
            continue
        if "legend_zone" in d.reasons:
            continue
        if "drawing_noise" in d.reasons:
            continue
        buckets[(d.fileId, d.sheetKey, d.signature)].append(d)

    groups = 0
    for n, (_key, dets) in enumerate(sorted(buckets.items(), key=lambda kv: kv[0][2]), start=1):
        label = _UNCLASSIFIED_LABEL if n == 1 and len(buckets) == 1 else f"{_UNCLASSIFIED_LABEL} #{n}"
        groups += 1
        for d in dets:
            if not d.tagText:
                d.tagText = label
            if "symbol_group_candidate" not in d.reasons:
                d.reasons.append("symbol_group_candidate")
    return groups