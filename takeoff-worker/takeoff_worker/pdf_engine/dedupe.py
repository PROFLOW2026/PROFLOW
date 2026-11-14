"""Near-duplicate detection collapse (same sheet, same class, < radius pt)."""
from __future__ import annotations

import math

from takeoff_worker.models import WorkerDetection


def collapse_duplicates(detections: list[WorkerDetection], radius_pt: float = 5.0) -> tuple[list[WorkerDetection], int]:
    """Keep highest-confidence detection; mark dropped with possible_duplicate on kept's twin."""
    by_sheet: dict[str, list[WorkerDetection]] = {}
    for d in detections:
        by_sheet.setdefault(d.sheetKey, []).append(d)

    rank = {"high": 0, "medium": 1, "low": 2, "none": 3}
    out: list[WorkerDetection] = []
    removed = 0
    for _sk, group in by_sheet.items():
        group = sorted(
            group,
            key=lambda d: (rank.get(d.confidence, 9), d.score if d.score is not None else 99),
        )
        kept: list[WorkerDetection] = []
        for d in group:
            if "legend_zone" in d.reasons:
                out.append(d)
                continue
            if d.native is None:
                out.append(d)
                continue
            dup = False
            for k in kept:
                if k.native is None:
                    continue
                if d.legendKey and k.legendKey and d.legendKey != k.legendKey:
                    continue
                dist = math.hypot(d.native.x - k.native.x, d.native.y - k.native.y)
                if dist <= radius_pt:
                    dup = True
                    if "possible_duplicate" not in k.reasons:
                        k.reasons.append("possible_duplicate")
                    break
            if dup:
                removed += 1
                continue
            kept.append(d)
            out.append(d)
    return out, removed