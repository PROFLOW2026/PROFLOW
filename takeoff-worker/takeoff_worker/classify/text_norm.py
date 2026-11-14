"""Hebrew legend text normalization (visual order, kbd decode)."""
from __future__ import annotations

import re

HEB = re.compile(r"[\u0590-\u05FF]")
HEBKEY = dict(zip("qwertyuiop[]asdfghjkl;'zxcvbnm,./", "/'קראטוןםפ][שדגכעיחלךף,זסבהנמצתץ."))


def decode_kbd(s: str) -> str:
    return "".join(HEBKEY.get(ch, ch) for ch in s.lower())


def _tokenize_mixed(s: str) -> list[str]:
    return re.findall(r"[\u0590-\u05FF]+|[A-Za-z]+|\d+(?:[./]\d+)?|[^\s]+", s)


def reverse_visual_hebrew(s: str) -> str:
    """Visual-order fix: reverse Hebrew token order; LTR numbers/tags stay readable."""
    if not s.strip():
        return s
    toks = _tokenize_mixed(s)
    if not toks:
        return s
    heb_idx = [i for i, t in enumerate(toks) if HEB.search(t)]
    if not heb_idx:
        return s
    rev = list(toks)
    heb_tokens = [toks[i] for i in heb_idx]
    for j, i in enumerate(reversed(heb_idx)):
        rev[i] = heb_tokens[j]
    return " ".join(rev)


_ABBREV: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'ג"ג'), "גמר גימור"),
    (re.compile(r'ת"ד'), "תאורה דלקת"),
    (re.compile(r"ת''ד"), "תאורה דלקת"),
    (re.compile(r'ת"ק'), "תאורת חירום"),
    (re.compile(r'ש"ח'), "שקע חכם"),
    (re.compile(r'מ"מ'), "מונית מדידה"),
]


def _expand_abbreviations(t: str) -> str:
    for rx, repl in _ABBREV:
        t = rx.sub(repl, t)
    return t


def _final_to_standard(s: str) -> str:
    return (
        s.replace("\u05dd", "\u05de")
        .replace("\u05df", "\u05e0")
        .replace("\u05dd", "\u05de")
        .replace("\u05da", "\u05db")
        .replace("\u05e3", "\u05e4")
        .replace("\u05e5", "\u05e6")
    )


def normalize_legend_text(raw: str, *, decoded_by: str | None = None) -> str:
    t = raw.replace("\n", " ").strip()
    t = t.replace("״", '"').replace("”", '"').replace("“", '"').replace("'", '"')
    t = re.sub(r"\s*([0-9]+(?:\.[0-9]+)?)\s*", r" \1 ", t)
    if decoded_by == "dwg_kbd":
        t = decode_kbd(t)
    t = _expand_abbreviations(t)
    t = reverse_visual_hebrew(t)
    if HEB.search(t):
        t = _final_to_standard(t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()