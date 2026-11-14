"""Hebrew PDF text decode (visual order reversal + fuzzy letter fixes)."""
from __future__ import annotations

import re

# Common visual-order confusions in scanned/legacy PDF text layers (י/ו/נ etc.)
_FUZZY = str.maketrans({"ו": "י", "ן": "נ", "ם": "מ", "ך": "כ", "ף": "פ", "ץ": "צ"})


def _is_hebrew(ch: str) -> bool:
    o = ord(ch)
    return 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F


def decode_pdf_text(raw: str) -> str:
    """Reverse Hebrew runs; keep Latin/digit order."""
    if not raw or not raw.strip():
        return ""
    parts: list[str] = []
    i = 0
    while i < len(raw):
        ch = raw[i]
        if _is_hebrew(ch):
            j = i
            while j < len(raw) and (_is_hebrew(raw[j]) or raw[j].isspace()):
                j += 1
            run = raw[i:j]
            rev = run.strip()[::-1]
            parts.append(rev.translate(_FUZZY))
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