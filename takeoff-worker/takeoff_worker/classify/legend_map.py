"""Rule-based legend text -> catalog typeKey with scored fuzzy matching."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import CatalogType, Confidence
from .text_norm import normalize_legend_text

NEGATIVE_PAIRS: dict[str, tuple[str, ...]] = {
    "light.emergency": ("רגיל", "לא חירום", "לא חירום"),
    "power.socket.single": ("חירום", "גוף תאורה", 'ג"ת'),
    "fire.smoke_detector": ("אזעקה", "לא שריפה"),
    "light.recessed": ("חירום",),
}


@dataclass(frozen=True)
class LegendMatch:
    type_key: str
    confidence: Confidence
    score: float
    ambiguous: bool = False


def _tokens(text: str) -> set[str]:
    t = re.sub(r"[^\w\u0590-\u05FF]+", " ", text.lower())
    return {w for w in t.split() if len(w) >= 2}


def match_legend_text(text: str, catalog: list[CatalogType]) -> LegendMatch | None:
    if not text.strip():
        return None
    text = normalize_legend_text(text, decoded_by="pdf_text")
    lower = text.lower()
    tokens = _tokens(text)
    best: LegendMatch | None = None
    tied_at_top = 0

    for item in catalog:
        if item.archived:
            continue
        score = 0.0
        matched_kw = 0
        for kw in item.keywordsHe:
            kwt = kw.lower().strip()
            if not kwt:
                continue
            if kwt in lower:
                score += 3.0 + min(len(kwt) / 20.0, 1.5)
                matched_kw += 1
            elif len(kwt) >= 4 and kwt[:4] in lower:
                score += 2.0
                matched_kw += 1
            elif _tokens(kwt) & tokens:
                score += 1.5
                matched_kw += 1
        for neg in NEGATIVE_PAIRS.get(item.key, ()):
            if neg in text:
                score -= 5.0
        if matched_kw == 0:
            continue
        conf: Confidence = "low"
        if score >= 5 and matched_kw >= 2:
            conf = "medium"
        if score >= 10 and matched_kw >= 3 and len(item.keywordsHe) <= matched_kw + 1:
            conf = "high"
        cand = LegendMatch(item.key, conf, score)
        if best is None or cand.score > best.score + 0.01:
            best = cand
            tied_at_top = 1
        elif best and abs(cand.score - best.score) < 0.01:
            tied_at_top += 1

    if best is None:
        return None
    ambiguous = tied_at_top > 1
    if best.confidence == "high" and ambiguous:
        return LegendMatch(best.type_key, "low", best.score, ambiguous=True)
    if best.score < 2.5:
        return None
    if ambiguous:
        return LegendMatch(best.type_key, "low", best.score, ambiguous=True)
    return best