"""Legend row text from pdfium char boxes (RTL / mojibake aware)."""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

from .geometry import PdfRect
from . import shape_engine as E
from .hebrew import decode_pdf_text

_MOJIBAKE = re.compile(r"[\uE000-\uF8FF\uFFFD]")
_CTRL = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f]")


def _is_mojibake(raw: str) -> bool:
    if not raw:
        return False
    if _CTRL.search(raw):
        return True
    bad = len(_MOJIBAKE.findall(raw))
    if bad >= 2 or (len(raw) > 4 and bad / len(raw) > 0.15):
        return True
    # Symbol-font garbage: mostly non-letter symbols
    letters = sum(1 for ch in raw if ch.isalnum() or ("\u0590" <= ch <= "\u05FF"))
    if len(raw) > 6 and letters / len(raw) < 0.25:
        return True
    return False


def _union_char_rect(chars: list[dict[str, Any]]) -> Optional[PdfRect]:
    if not chars:
        return None
    r = chars[0]["rect"]
    for c in chars[1:]:
        r = r | c["rect"]
    return r


def legend_row_text_chars(
    chars: list[dict[str, Any]],
    comp: E.Comp,
    *,
    words: Optional[list[dict]] = None,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[PdfRect], list[str]]:
    """Return raw, decoded, tag, textBox (display pt), reasons (e.g. legend_text_undecodable)."""
    reasons: list[str] = []
    cy = (comp.rect.y0 + comp.rect.y1) / 2
    band = max(comp.rect.height, 8.0) * 1.35
    side = max(comp.rect.width * 2.5, 60.0)

    row_chars: list[dict[str, Any]] = []
    for ch in chars:
        if abs(ch["cy"] - cy) > band:
            continue
        cr: PdfRect = ch["rect"]
        dx = min(abs(cr.x0 - comp.rect.x1), abs(cr.x1 - comp.rect.x0))
        # RTL margin legend: label sits to the left of the symbol (AS1749-style rows).
        left_of_symbol = cr.x1 <= comp.rect.x0 + 10 and cr.x0 >= comp.rect.x0 - side
        if dx > side and not left_of_symbol and not (comp.rect.x0 - 5 <= cr.x0 <= comp.rect.x1 + 5):
            continue
        if ch.get("char") in ("\r", "\n", " "):
            if row_chars and row_chars[-1].get("char") == " ":
                continue
        row_chars.append(ch)

    raw: Optional[str] = None
    text_box: Optional[PdfRect] = None

    if len(row_chars) >= 2:
        # Visual L→R order on page; Hebrew logical order via decode_pdf_text.
        row_chars.sort(key=lambda c: c["cx"])
        raw = "".join(c["char"] for c in row_chars if c["char"] not in ("\r", "\n"))
        raw = re.sub(r"\s+", " ", raw).strip()
        text_box = _union_char_rect(row_chars)

    if not raw and words:
        from .legend import legend_row_text_v2

        w_raw, w_dec, tag = legend_row_text_v2(words, comp)
        if w_raw:
            raw = w_raw
            decoded = w_dec
            if _is_mojibake(raw):
                reasons.append("legend_text_undecodable")
                decoded = None
            return raw, decoded, tag, text_box, reasons
        return None, None, None, text_box, reasons

    if not raw:
        return None, None, None, None, reasons

    if _is_mojibake(raw):
        reasons.append("legend_text_undecodable")
        return raw, None, None, text_box, reasons

    decoded = decode_pdf_text(raw)
    if decoded and _is_mojibake(decoded):
        reasons.append("legend_text_undecodable")
        decoded = None
    elif not decoded or decoded == raw:
        # Still unusable for catalog match when no Hebrew/Latin content
        if not re.search(r"[A-Za-z\u0590-\u05FF]", decoded or raw):
            reasons.append("legend_text_undecodable")
            decoded = None
    tag = None
    if decoded:
        toks = decoded.split()
        tag = toks[0] if toks and len(toks[0]) <= 14 else None
    elif raw and len(raw) <= 14:
        tag = raw
    return raw, decoded or None, tag, text_box, reasons