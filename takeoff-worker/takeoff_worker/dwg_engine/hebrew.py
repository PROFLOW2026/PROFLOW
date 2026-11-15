"""Hebrew SHX keyboard-layout decode for DWG TEXT/MTEXT."""
from __future__ import annotations

import re

HEBREW_RE = re.compile(r"[\u0590-\u05FF]")
# Standard Israeli keyboard: Latin keys -> Hebrew glyphs (research dwg_deep.decode_kbd).
HEB_KEYBOARD: dict[str, str] = dict(
    zip(
        "qwertyuiop[]asdfghjkl;'zxcvbnm,./",
        "/'קראטוןםפ][שדגכעיחלךף,זסבהנמצתץ.",
    )
)

# Israeli CAD SHX faces store Hebrew as Latin keystrokes. Names are font files,
# not block names — a block tag is never translated into a catalog type here.
HEBREW_SHX_HINTS = (
    "hebrew",
    "heb",
    "sivan",
    "miryl",
    "mirym",
    "miryam",
    "narkis",
    "david",
    "caes",
    "cob",
    "oron",
    "moran",
    "hb1",
    "grm",
)


def decode_kbd(s: str) -> str:
    # '[' in cob/heb SHX is final tsadi. The keyboard map turns that key into ']'.
    t = "".join(HEB_KEYBOARD.get(ch, ch) for ch in s.lower())
    return re.sub(r"(?<=[\u0590-\u05FF])\]", "ץ", t)


def _hebrew_score(s: str) -> int:
    return len(HEBREW_RE.findall(s))


def _looks_kbd_encoded(s: str) -> bool:
    if not s or HEBREW_RE.search(s):
        return False
    if not re.fullmatch(r"[A-Za-z;,./\[\]' \d\-]{2,}", s.strip()):
        return False
    dec = decode_kbd(s)
    return _hebrew_score(dec) >= max(2, len(dec) // 4)


def style_uses_hebrew_shx(font_name: str, bigfont: str = "") -> bool:
    combined = (font_name + "|" + bigfont).lower()
    return any(h in combined for h in HEBREW_SHX_HINTS)


def decode_dwg_text(raw: str, *, font_name: str = "", bigfont: str = "") -> tuple[str, str | None]:
    """Return (text_for_pipeline, decodedBy hint or None).

    Unicode Hebrew is returned unchanged with decodedBy None (already logical).
    Latin-keyboard Hebrew is decoded with decodedBy 'dwg_kbd' when applied.
    """
    if not raw:
        return raw, None
    if HEBREW_RE.search(raw):
        return raw, None
    if style_uses_hebrew_shx(font_name, bigfont) or _looks_kbd_encoded(raw):
        dec = decode_kbd(raw)
        if _hebrew_score(dec) > _hebrew_score(raw):
            return dec, "dwg_kbd"
    return raw, None