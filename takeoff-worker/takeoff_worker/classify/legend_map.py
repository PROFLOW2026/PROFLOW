"""Rule-based legend text -> catalog typeKey with scored fuzzy matching."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import CatalogType, Confidence
from .text_norm import _final_to_standard, normalize_legend_text

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


def _keyword_may_assign(keyword: str, description: str) -> bool:
    """A one-word keyword assigns a type only when it is the whole description."""
    words = [part for part in keyword.split() if part]
    if len(words) >= 2:
        return True
    return " ".join(keyword.casefold().split()) == " ".join(description.casefold().split())


def _with_token_order_restored(text: str) -> str:
    """``match_legend_text`` stores visual Hebrew. A catalog phrase is logical."""
    return " ".join(reversed(text.split()))


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
    best: LegendMatch | None = None
    longest: dict[str, str] = {}

    for item in catalog:
        if item.archived:
            continue
        score = 0.0
        matched_kw = 0
        for kw in item.keywordsHe:
            kwt = _final_to_standard(kw.lower().strip())
            if not kwt:
                continue
            if not _keyword_may_assign(kwt, lower):
                continue
            if _phrase_in(lower, kwt) or _phrase_in(_with_token_order_restored(lower), kwt):
                score += 3.0 + min(len(kwt) / 20.0, 1.5)
                matched_kw += 1
                if len(kwt) > len(longest.get(item.key, "")):
                    longest[item.key] = kwt
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
        if score < 2.5:
            longest.pop(item.key, None)
        if best is None or cand.score > best.score:
            best = cand

    if best is None:
        return None
    # A shared word such as לוח does not name a panel, and it does not name the generator.
    if "לוח" in lower and not best.type_key.startswith("panel."):
        return None
    phrases = list(longest.items())
    kept = [
        key
        for key, phrase in phrases
        if not any(key != other and phrase != other_phrase and phrase in other_phrase for other, other_phrase in phrases)
    ]
    if len(kept) != 1:
        return None
    ambiguous = False
    if best.confidence == "high" and ambiguous:
        return LegendMatch(best.type_key, "low", best.score, ambiguous=True)
    if best.score < 2.5:
        return None
    if ambiguous:
        return LegendMatch(best.type_key, "low", best.score, ambiguous=True)
    return best