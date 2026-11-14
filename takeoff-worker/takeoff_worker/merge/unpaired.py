"""Tag unpaired PDF plan detections when DWG is present but merge did not run."""
from __future__ import annotations

from ..models import WorkerDetection, WorkerFile, WorkerWarning


def _is_legend_pdf(name: str) -> bool:
    n = name.lower()
    return "מקרא" in name or "legend" in n


def apply_unpaired_pdf_policy(
    detections: list[WorkerDetection],
    files: list[WorkerFile],
) -> tuple[int, list[WorkerWarning]]:
    """Return count of PDF rows newly marked ``pdf_only``."""
    has_dwg = any(f.kind in ("dwg", "dxf") for f in files)
    if not has_dwg:
        return 0, []

    pdf_plan_files = {f.fileId for f in files if f.kind == "pdf" and not _is_legend_pdf(f.name)}
    if not pdf_plan_files:
        return 0, []

    tagged = 0
    updated: list[WorkerDetection] = []
    for d in detections:
        if d.source != "pdf" or d.fileId not in pdf_plan_files:
            updated.append(d)
            continue
        if "legend_zone" in d.reasons:
            updated.append(d)
            continue
        reasons = list(d.reasons)
        if "pdf_only" not in reasons:
            reasons.append("pdf_only")
            tagged += 1
        updated.append(d.model_copy(deep=True, update={"reasons": reasons}))

    warnings: list[WorkerWarning] = []
    if tagged:
        warnings.append(
            WorkerWarning(
                code="pdf_dwg_unpaired",
                severity="warning",
                message=(
                    "PDF and DWG were not paired before analysis — "
                    f"{tagged} PDF plan symbol(s) marked pdf_only (not BOQ until confirm)."
                ),
            )
        )
    detections[:] = updated
    return tagged, warnings