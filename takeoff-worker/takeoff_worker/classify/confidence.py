"""Calibrate detection confidence — high is rare and meaningful."""
from __future__ import annotations

from ..models import Confidence, WorkerDetection, WorkerLegendEntry
from .indices import build_legend_indices

_STRONG_MARGIN = 0.35


def calibrate_confidences(
    detections: list[WorkerDetection],
    legend: list[WorkerLegendEntry],
) -> list[WorkerDetection]:
    indices = build_legend_indices(legend)
    out: list[WorkerDetection] = []
    for d in detections:
        det = d.model_copy(deep=True)
        if det.classifiedBy == "library":
            det.confidence = "high"
            out.append(det)
            continue

        twin_ok = det.twinId is not None and "pdf_dwg_mismatch" not in det.reasons
        legend_ok = False
        if det.legendKey:
            h = indices["key"].get(det.legendKey)
            legend_ok = h is not None and h.type_key == det.typeKey

        engine_margin = det.margin if det.margin is not None else None
        engine_score = det.score is not None and det.score <= 0.25
        template_strong = engine_margin is not None and engine_margin >= _STRONG_MARGIN and engine_score

        if det.typeKey is None:
            det.confidence = "none"
        elif twin_ok and legend_ok and template_strong:
            det.confidence = "high"
        elif twin_ok and det.typeKey and det.classifiedBy in ("legend_text", "dwg_block_map"):
            det.confidence = _cap(det.confidence, "medium")
        elif det.classifiedBy in ("legend_text", "dwg_block_map") and legend_ok:
            det.confidence = _cap(det.confidence, "medium")
        elif det.confidence == "high" and det.classifiedBy != "library":
            det.confidence = "medium"

        if det.confidence in ("low", "none") and "low_confidence" not in det.reasons:
            det.reasons = [*det.reasons, "low_confidence"]

        out.append(det)
    return out


def _cap(current: Confidence, ceiling: Confidence) -> Confidence:
    order: list[Confidence] = ["high", "medium", "low", "none"]
    return order[min(order.index(current), order.index(ceiling))]