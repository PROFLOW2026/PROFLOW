"""Hebrew PDF text decode (visual order reversal + fuzzy letter fixes)."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_HEB_RUN = re.compile(r"[\u0590-\u05FF\uFB1D-\uFB4F]+")
_FINALS = frozenset("ךםןףץ")
_WORD_INITIAL = frozenset("תשמבכלדוגנרהופצקזסאיע")

_PKG = Path(__file__).resolve().parent.parent


def _is_hebrew(ch: str) -> bool:
    o = ord(ch)
    return 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F


@lru_cache(maxsize=1)
def _legend_lexicon() -> frozenset[str]:
    path = _PKG / "data" / "catalog.default.json"
    if not path.is_file():
        return frozenset()
    raw = json.loads(path.read_text(encoding="utf-8"))
    words: set[str] = set()
    for row in raw:
        for phrase in row.get("keywordsHe") or []:
            phrase = str(phrase).strip()
            if not phrase:
                continue
            words.add(phrase)
            for tok in re.findall(r"[\u0590-\u05FF]+", phrase):
                if len(tok) >= 2:
                    words.add(tok)
    return frozenset(words)


def _has_misplaced_finals(word: str) -> bool:
    return any(ch in _FINALS for ch in word[:-1])


def _orient_hebrew_word(word: str, lexicon: frozenset[str]) -> str:
    if not word:
        return word
    if word in lexicon:
        return word
    rev = word[::-1]
    if rev in lexicon:
        return rev
    if _has_misplaced_finals(word) and not _has_misplaced_finals(rev):
        return rev
    if _has_misplaced_finals(rev) and not _has_misplaced_finals(word):
        return word
    if word[0] in _FINALS:
        return rev
    if rev and rev[0] in _WORD_INITIAL and word[0] not in _WORD_INITIAL:
        return rev
    if word[0] in _WORD_INITIAL and rev and rev[0] not in _WORD_INITIAL:
        return word
    # Ambiguous: pdfium sometimes emits logical order already — do not flip by default.
    return word


def _decode_hebrew_run(run: str, lexicon: frozenset[str]) -> str:
    parts: list[str] = []
    for piece in re.split(r"(\s+)", run):
        if not piece:
            continue
        if piece.isspace():
            parts.append(piece)
            continue
        if _HEB_RUN.fullmatch(piece):
            parts.append(_orient_hebrew_word(piece, lexicon))
        else:
            parts.append(piece)
    return "".join(parts)


def decode_pdf_text(raw: str) -> str:
    """Reverse Hebrew runs char-wise when extracted in visual L→R order; keep Latin/digit order."""
    if not raw or not raw.strip():
        return ""
    lexicon = _legend_lexicon()
    parts: list[str] = []
    i = 0
    while i < len(raw):
        ch = raw[i]
        if _is_hebrew(ch):
            j = i
            while j < len(raw) and (_is_hebrew(raw[j]) or raw[j].isspace()):
                j += 1
            run = raw[i:j]
            parts.append(_decode_hebrew_run(run, lexicon))
            i = j
        else:
            j = i
            while j < len(raw) and not _is_hebrew(raw[j]):
                j += 1
            parts.append(raw[i:j])
            i = j
    out = "".join(parts)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def collect_text_blob(words: list[dict]) -> str:
    return " ".join(w.get("text", "") for w in words if w.get("text"))