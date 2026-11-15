"""Socket quantity from symbol marks and nearby X2 notes.

An X2 note, including x2, ×2, a space between the mark and 2, or surrounding punctuation, means that one symbol is two devices. A note attaches only to the nearest symbol whose center is within 2.5 extents when that symbol is strictly closer by at least 0.25 of its own extent; otherwise the note stays unassigned. Each symbol is kept once, a second X2 on an already counted symbol does not multiply again, and device_count is the sum of per-symbol devices.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

_MARKS = frozenset("xX\u00d7")
_MULTIPLIER = re.compile(r"^[xX\u00d7]\s*2$")
_FORMAT = re.compile(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]")
_REACH_FACTOR = 2.5
_SEPARATION_FACTOR = 0.25


@dataclass(frozen=True)
class SymbolMark:
    id: str
    x: float
    y: float
    extent: float  # symbol size, > 0


@dataclass(frozen=True)
class NoteMark:
    text: str
    x: float
    y: float


@dataclass(frozen=True)
class SocketQuantity:
    symbol_count: int
    device_count: int
    assigned: tuple[tuple[str, int], ...]  # (symbol id, devices for that symbol), symbols in input order
    unassigned_notes: int


def _is_outer_punctuation(ch: str) -> bool:
    return ch not in _MARKS and not ch.isalnum() and not ch.isspace()


def _core_token(text: str) -> str:
    core = text.strip()
    while core and _is_outer_punctuation(core[0]):
        core = core[1:].strip()
    while core and _is_outer_punctuation(core[-1]):
        core = core[:-1].strip()
    return core


def note_devices(text: str) -> int | None:
    """2 when the text is an X2 multiplier. None otherwise."""
    if _MULTIPLIER.fullmatch(_core_token(text)):
        return 2
    return None


def ocr_multiplier_text(text: str) -> str | None:
    """``X2`` when OCR read the note, including a bidi mark or one merged letter.

    ``EX2`` is the note with a neighbor stroke read as a letter. ``X4``,
    ``X24``, and ``2X16A`` stay empty.
    """
    cleaned = _FORMAT.sub("", text or "")
    if note_devices(cleaned) == 2:
        return "X2"
    core = _core_token(cleaned)
    if len(core) == 3 and core[0].isalpha() and note_devices(core[1:]) == 2:
        return "X2"
    return None


def _nearest_symbol(note: NoteMark, symbols: list[SymbolMark]) -> int | None:
    ranked: list[tuple[float, int, float]] = []
    for index, symbol in enumerate(symbols):
        if symbol.extent <= 0:
            continue
        distance = math.hypot(note.x - symbol.x, note.y - symbol.y)
        if distance <= _REACH_FACTOR * symbol.extent:
            ranked.append((distance, index, symbol.extent))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1]))
    if len(ranked) > 1:
        gap = ranked[1][0] - ranked[0][0]
        margin = _SEPARATION_FACTOR * ranked[0][2]
        if gap <= 0 or gap < margin:
            return None
    return ranked[0][1]


def multiplier_notes(words: list[tuple[str, float, float]]) -> list[NoteMark]:
    """X2 notes from OCR words.

    A word that is itself X2 is one note. A split pair, the letter then the
    digit 2, is one note when the two centers are within 18 units. X4, an
    ampere note, and a bare 2 are not notes. The second X2 on a symbol is
    ignored later by :func:`socket_quantity`.
    """

    notes: list[NoteMark] = []
    consumed: set[int] = set()
    for index, (text, x, y) in enumerate(words):
        if index in consumed:
            continue
        if ocr_multiplier_text(text) == "X2":
            notes.append(NoteMark(text="X2", x=x, y=y))
            continue
        core = _core_token(text)
        if core not in _MARKS or index + 1 >= len(words):
            continue
        next_text, next_x, next_y = words[index + 1]
        if _core_token(next_text) != "2":
            continue
        if math.hypot(next_x - x, next_y - y) > 18.0:
            continue
        consumed.add(index + 1)
        notes.append(NoteMark(text="X2", x=(x + next_x) / 2.0, y=(y + next_y) / 2.0))
    return notes


def socket_quantity(symbols: list[SymbolMark], notes: list[NoteMark]) -> SocketQuantity:
    devices = [1] * len(symbols)
    multiplied: set[int] = set()
    unassigned = 0
    for note in notes:
        count = note_devices(note.text)
        if count is None:
            continue
        index = _nearest_symbol(note, symbols)
        if index is None:
            unassigned += 1
            continue
        if index in multiplied:
            continue
        devices[index] = 1 + (count - 1)
        multiplied.add(index)
    assigned = tuple((symbol.id, devices[index]) for index, symbol in enumerate(symbols))
    return SocketQuantity(
        symbol_count=len(symbols),
        device_count=sum(devices),
        assigned=assigned,
        unassigned_notes=unassigned,
    )
