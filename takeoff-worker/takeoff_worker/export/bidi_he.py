"""Minimal Hebrew bidi (MIT, in-tree) — digits/Latin stay LTR."""
from __future__ import annotations

_HEBREW = range(0x0590, 0x06FF)


def _is_heb(ch: str) -> bool:
    return ord(ch) in _HEBREW


def shape_rtl(line: str) -> str:
    """Reverse Hebrew runs for visual RTL display in PDF."""
    if not line:
        return line
    out: list[str] = []
    i = 0
    while i < len(line):
        if _is_heb(line[i]):
            j = i
            while j < len(line) and _is_heb(line[j]):
                j += 1
            out.append(line[i:j][::-1])
            i = j
        else:
            j = i
            while j < len(line) and not _is_heb(line[j]):
                j += 1
            out.append(line[i:j])
            i = j
    return "".join(out)