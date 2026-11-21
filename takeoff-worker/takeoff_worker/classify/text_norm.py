"""Hebrew legend text normalization (visual order, kbd decode)."""
from __future__ import annotations

import re

HEB = re.compile(r"[\u0590-\u05FF]")
HEBKEY = dict(zip("qwertyuiop[]asdfghjkl;'zxcvbnm,./", "/'קראטוןםפ][שדגכעיחלךף,זסבהנמצתץ."))


def decode_kbd(s: str) -> str:
    return _repair_shx_final_tsadi("".join(HEBKEY.get(ch, ch) for ch in s.lower()))


def _repair_shx_final_tsadi(t: str) -> str:
    """cob/heb SHX draws the '[' key as final tsadi; the keyboard map yields ']'."""
    return re.sub(r"(?<=[\u0590-\u05FF])\]", "ץ", t)


# Dotted ב.ת only. A period between other letters is not this abbreviation.
_BET_TAKA = re.compile(r"(?<![\u0590-\u05FF])ב\s*\.\s*ת(?![\u0590-\u05FF])")
# ג"ת is גוף תאורה. OCR keeps the quote, which otherwise splits the abbreviation.
_GIMEL_TAV = re.compile(r"ג\s*[\"״']\s*ת")
# בית-תקע must stay one phrase. A hyphen is not a letter boundary the catalog knows.
_HEB_HYPHEN = re.compile(r"(?<=[\u0590-\u05FF])[-\u05be](?=[\u0590-\u05FF])")
# ושקע רגיל is "and a regular socket". Keep the catalog phrase intact.
_CONJ_VAV = re.compile(r"(?<![\u0590-\u05FF])ו(?=[\u0590-\u05FF]{3,})")


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


# נקודה לטלפון → נקודת טלפון. A trailing location word is not a type.
_POINT_TO_ONE = re.compile(
    r"נקודה\s+ל[\u05be\-–]?\s*([\u0590-\u05FF]+)(?:\s+(חוץ|פנים|חיצוני|פנימי|גינה|מרפסת|גג|חניה))?\s*$"
)
# מפסק מאור חילוף → מפסק חילוף. Bare מפסק מאור → מפסק תאורה.
_SWITCH_MAOR = re.compile(r"מפסק\s+מאור(?:\s+(כפול|חילוף|ביניים|תריס|יחיד|צלב|מחליף))?")


def _expand_point_to(t: str) -> str:
    return _POINT_TO_ONE.sub(r"נקודת \1", t)


def _expand_switch_maor(t: str) -> str:
    def repl(match: re.Match[str]) -> str:
        extra = match.group(1)
        if extra:
            return f"מפסק {extra}"
        return "מפסק תאורה"

    return _SWITCH_MAOR.sub(repl, t)


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


def _expand_bet_taka(t: str) -> str:
    """ב.ת is בית תקע. Expand before the visual reverse so the dot cannot split the word."""
    return _BET_TAKA.sub("בית תקע", t)


def _expand_gimel_tav(t: str) -> str:
    return _GIMEL_TAV.sub("גוף תאורה", t)


def _join_hebrew_hyphen(t: str) -> str:
    return _HEB_HYPHEN.sub(" ", t)


def _split_conjunctive_vav(t: str) -> str:
    return _CONJ_VAV.sub("", t)


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
    else:
        t = _repair_shx_final_tsadi(t)
    t = _expand_abbreviations(t)
    t = _expand_gimel_tav(t)
    t = _expand_point_to(t)
    t = _expand_switch_maor(t)
    t = _join_hebrew_hyphen(t)
    t = _split_conjunctive_vav(t)
    t = _expand_bet_taka(t)
    t = reverse_visual_hebrew(t)
    if HEB.search(t):
        t = _final_to_standard(t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()