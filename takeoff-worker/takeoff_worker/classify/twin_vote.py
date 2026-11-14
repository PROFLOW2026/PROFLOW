"""Twin-based propagation: PDF L-key -> typeKey from paired DWG block types."""
from __future__ import annotations

from collections import Counter, defaultdict

from ..models import CatalogType, Confidence, WorkerDetection, WorkerLegendEntry
from .indices import TypeHint, build_legend_indices
from .legend_map import match_legend_text

MIN_TWIN_SUPPORT = 3
MIN_TWIN_PURITY = 0.65
STRONG_PURITY = 0.85
STRONG_SUPPORT = 5


def _vote_winner(votes: Counter[str]) -> tuple[str | None, int, float]:
    if not votes:
        return None, 0, 0.0
    top = votes.most_common(2)
    key, count = top[0]
    total = sum(votes.values())
    purity = count / total if total else 0.0
    if count < MIN_TWIN_SUPPORT or purity < MIN_TWIN_PURITY:
        return None, count, purity
    if len(top) > 1 and top[1][1] == count:
        return None, count, purity
    return key, count, purity


def collect_twin_votes(
    detections: list[WorkerDetection],
) -> tuple[dict[str, tuple[str, int, float]], dict[str, tuple[str, int, float]]]:
    """Returns (legend_key_votes, block_votes) -> (typeKey, support, purity)."""
    by_twin: dict[str, list[WorkerDetection]] = defaultdict(list)
    for d in detections:
        if d.twinId:
            by_twin[d.twinId].append(d)

    lk_acc: dict[str, Counter[str]] = defaultdict(Counter)
    block_acc: dict[str, Counter[str]] = defaultdict(Counter)

    for group in by_twin.values():
        pdfs = [d for d in group if d.source == "pdf"]
        dwgs = [d for d in group if d.source == "dwg" and d.typeKey]
        if not pdfs or not dwgs:
            continue
        for pd in pdfs:
            if not pd.legendKey:
                continue
            for dw in dwgs:
                lk_acc[pd.legendKey][dw.typeKey] += 1
        for dw in dwgs:
            if not dw.typeKey:
                continue
            bn = (dw.blockName or dw.rawClass or "").lower().replace("block:", "")
            if not bn:
                continue
            for other in dwgs:
                if other.typeKey:
                    block_acc[bn][other.typeKey] += 1

    lk_out: dict[str, tuple[str, int, float]] = {}
    for lk, votes in lk_acc.items():
        key, cnt, pur = _vote_winner(votes)
        if key:
            lk_out[lk] = (key, cnt, pur)

    block_out: dict[str, tuple[str, int, float]] = {}
    for bn, votes in block_acc.items():
        key, cnt, pur = _vote_winner(votes)
        if key:
            block_out[bn] = (key, cnt, pur)

    return lk_out, block_out


def apply_twin_voting(
    detections: list[WorkerDetection],
    legend: list[WorkerLegendEntry],
    catalog: list[CatalogType],
) -> tuple[list[WorkerDetection], list[WorkerLegendEntry]]:
    lk_votes, block_votes = collect_twin_votes(detections)

    legend_by_key = {e.key: e for e in legend}
    for lk, (type_key, support, purity) in lk_votes.items():
        row = legend_by_key.get(lk)
        if row is None:
            continue
        if row.typeKey is None or row.typeKey == type_key:
            row.typeKey = type_key
            row.confidence = _vote_confidence(purity, support, row)
        elif row.typeKey != type_key:
            row.confidence = "low"

    indices = build_legend_indices(legend)
    out: list[WorkerDetection] = []
    for d in detections:
        det = d.model_copy(deep=True)
        reasons = list(det.reasons)

        if det.typeKey is None and det.legendKey and det.legendKey in lk_votes:
            tk, support, purity = lk_votes[det.legendKey]
            det.typeKey = tk
            det.classifiedBy = "legend_text"
            det.confidence = _vote_confidence(purity, support, legend_by_key.get(det.legendKey))
            if "unclassified" in reasons:
                reasons.remove("unclassified")
            if "legend_unmapped" in reasons:
                reasons.remove("legend_unmapped")

        if det.typeKey is None and det.source == "dwg":
            bn = (det.blockName or det.rawClass or "").lower().replace("block:", "")
            if bn and bn in block_votes:
                tk, support, purity = block_votes[bn]
                det.typeKey = tk
                det.classifiedBy = "dwg_block_map"
                det.confidence = _vote_confidence(purity, support, None)

        if det.typeKey is None and det.legendKey:
            h = indices["key"].get(det.legendKey)
            if h:
                det.typeKey = h.type_key
                det.classifiedBy = "legend_text"
                det.confidence = h.confidence

        if det.typeKey is None and det.legendKey and "legend_unmapped" not in reasons:
            if not match_legend_text(det.tagText or "", catalog):
                reasons.append("legend_unmapped")

        det.reasons = list(dict.fromkeys(reasons))
        out.append(det)
    return out, legend


def _vote_confidence(purity: float, support: int, legend_row: WorkerLegendEntry | None) -> Confidence:
    if purity >= STRONG_PURITY and support >= STRONG_SUPPORT:
        return "high"
    if purity >= MIN_TWIN_PURITY and support >= MIN_TWIN_SUPPORT:
        return "medium"
    if legend_row and legend_row.confidence in ("high", "medium"):
        return legend_row.confidence
    return "low"


def side_stats(detections: list[WorkerDetection]) -> dict[str, float]:
    pdf = [d for d in detections if d.source == "pdf"]
    dwg = [d for d in detections if d.source == "dwg"]
    countable_pdf = [d for d in pdf if "legend_zone" not in d.reasons]
    countable_dwg = dwg
    return {
        "classified_pdf": float(sum(1 for d in countable_pdf if d.typeKey)),
        "detection_pdf": float(len(countable_pdf)),
        "classified_dwg": float(sum(1 for d in dwg if d.typeKey)),
        "detection_dwg": float(len(dwg)),
        "classified_pdf_pct": 100.0 * sum(1 for d in countable_pdf if d.typeKey) / max(len(countable_pdf), 1),
        "classified_dwg_pct": 100.0 * sum(1 for d in dwg if d.typeKey) / max(len(dwg), 1),
    }


def top_type_table(
    detections: list[WorkerDetection],
    *,
    limit: int = 10,
) -> dict[str, dict[str, float]]:
    pdf = Counter(d.typeKey or "UNCLASSIFIED" for d in detections if d.source == "pdf" and "legend_zone" not in d.reasons)
    dwg = Counter(d.typeKey or "UNCLASSIFIED" for d in detections if d.source == "dwg")
    keys = list({*pdf.keys(), *dwg.keys()})
    keys.sort(key=lambda k: -(pdf[k] + dwg[k]))
    out: dict[str, dict[str, float]] = {}
    for k in keys[:limit]:
        out[k] = {"pdf": float(pdf[k]), "dwg": float(dwg[k])}
    return out