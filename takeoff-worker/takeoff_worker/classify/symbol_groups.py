"""Label unclassified plan symbols by shape signature for human review / library save."""
from __future__ import annotations

from collections import defaultdict

from ..models import WorkerDetection


def assign_symbol_group_labels(detections: list[WorkerDetection]) -> int:
    """Set ``tagText`` to ``symbol group #N`` for unclassified non-legend detections; return group count."""
    buckets: dict[tuple[str, str, str], list[WorkerDetection]] = defaultdict(list)
    for d in detections:
        if d.typeKey is not None:
            continue
        if "legend_zone" in d.reasons:
            continue
        buckets[(d.fileId, d.sheetKey, d.signature)].append(d)

    groups = 0
    for n, (_key, dets) in enumerate(sorted(buckets.items(), key=lambda kv: kv[0][2]), start=1):
        label = f"symbol group #{n}"
        groups += 1
        for d in dets:
            if not d.tagText:
                d.tagText = label
            if "symbol_group_candidate" not in d.reasons:
                d.reasons.append("symbol_group_candidate")
    return groups