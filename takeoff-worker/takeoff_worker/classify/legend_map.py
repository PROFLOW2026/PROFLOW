"""Rule-based legend text -> catalog typeKey with scored fuzzy matching."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import CatalogType, Confidence
from .text_norm import normalize_legend_text

# Single-word legend roots that appear inside many longer catalog keywords.
_HEB_SHORT_ROOT: dict[str, str] = {
    "שקע": "power.socket.single",
}

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


def _phrase_in(hay: str, phrase: str) -> bool:
    """A keyword must not match inside a longer Hebrew word (אחר inside אחרת)."""
    if not phrase:
        return False
    return re.search(rf"(?<![\u0590-\u05FF]){re.escape(phrase)}(?![\u0590-\u05FF])", hay) is not None


def _tokens(text: str) -> set[str]:
    t = re.sub(r"[^\w\u0590-\u05FF]+", " ", text.lower())
    return {w for w in t.split() if len(w) >= 2}


_STATED_SOCKETS = re.compile(r"(?<!\d)(\d+)\s*שקע")
_STATED_SOCKETS_AFTER = re.compile(r"שקע[א-ת]*\s+(\d+)(?!\d)")


def is_socket_bank(text: str) -> bool:
    """A socket cluster (מקבץ שקעים). Not one outlet, and not a count by itself."""
    if not text.strip():
        return False
    folded = normalize_legend_text(text, decoded_by="pdf_text")
    return "מקבצ" in folded and "שקע" in folded


def stated_socket_count(text: str) -> int | None:
    """Sockets the legend actually writes, as in '4 שקעים'.

    A module count ('4 מודולים') or a model code ('ג-17') is not a socket count.
    None means the quantity is unknown and must not be invented.
    """
    if not text.strip():
        return None
    folded = normalize_legend_text(text, decoded_by="pdf_text")
    restored = normalize_legend_text(folded, decoded_by="pdf_text")
    for blob in (folded, restored):
        found = _STATED_SOCKETS.search(blob) or _STATED_SOCKETS_AFTER.search(blob)
        if found:
            return int(found.group(1))
    return None


def match_legend_text(text: str, catalog: list[CatalogType]) -> LegendMatch | None:
    if not text.strip():
        return None
    text = normalize_legend_text(text, decoded_by="pdf_text")
    # A bank stays untyped. '4 שקעים' may name a count; it is still not one single socket.
    if "מקבצ" in text and "שקע" in text:
        return None
    lower = text.lower()
    tokens = _tokens(text)
    best: LegendMatch | None = None
    tied_at_top = 0

    for item in catalog:
        if item.archived:
            continue
        score = 0.0
        matched_kw = 0
        overlap_tokens: set[str] = set()
        for kw in item.keywordsHe:
            kwt = kw.lower().strip()
            if not kwt:
                continue
            if _phrase_in(lower, kwt):
                score += 3.0 + min(len(kwt) / 20.0, 1.5)
                matched_kw += 1
            elif len(lower) >= 2 and len(lower) <= 12 and lower in kwt:
                score += 2.5
                matched_kw += 1
            elif len(kwt) >= 4 and kwt[:4] in lower:
                score += 2.0
                matched_kw += 1
            else:
                # One shared word across several keywords must not stack into a type.
                # "פאזי" alone is not "תלת פאזי".
                overlap_tokens |= _tokens(kwt) & tokens
        if overlap_tokens:
            score += 1.5
            matched_kw += 1
        # "פאזי" is shared by single-phase and three-phase lines. A sealed outlet
        # needs a word that actually says it is sealed.
        if item.key == "power.socket.three_phase" and "תלת" not in lower:
            score = 0.0
            matched_kw = 0
        if item.key == "power.socket.ip" and not any(w in lower for w in ("הרמטי", "מוגן", "ip", "ןפ")):
            score = 0.0
            matched_kw = 0
        # חד-תכליתי is a single-purpose emergency light, not a combo fixture.
        if item.key == "light.emergency_combo" and "חד" in lower and "תכלית" in lower and "דו" not in lower:
            score = 0.0
            matched_kw = 0
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

    canon = _HEB_SHORT_ROOT.get(lower.strip())
    if canon is not None:
        if best is None or best.score < 2.5 or best.type_key != canon:
            conf: Confidence = best.confidence if best and best.type_key == canon else "low"
            score = best.score if best else 2.5
            amb = best is not None and best.type_key != canon
            return LegendMatch(canon, conf, score, ambiguous=amb)

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