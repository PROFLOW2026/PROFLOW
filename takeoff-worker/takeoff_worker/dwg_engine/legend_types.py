"""Legend text → catalog typeKey. A block name is never a type by itself."""
from __future__ import annotations

from ..classify.legend_map import is_socket_bank, match_legend_text
from ..classify.text_norm import normalize_legend_text
from ..models import CatalogType

_CONF = ("high", "medium", "low", "none")


def legend_match_text(row: dict) -> str:
    """Same order as the pipeline legend matcher: keyboard Hebrew is decoded once here.

    ``match_legend_text`` normalizes again, which restores logical Hebrew token order.
    """
    raw = str(row.get("rawText") or "")
    decoded = str(row.get("decodedText") or "")
    by = row.get("decodedBy")
    if by == "none":
        by = None
    if by == "dwg_kbd" and raw:
        return normalize_legend_text(raw, decoded_by="dwg_kbd")
    if decoded:
        return normalize_legend_text(decoded, decoded_by=by)
    if raw:
        return normalize_legend_text(raw, decoded_by=by)
    return ""


_NOTE_MARKERS = ("בקומות", "גישור", "כבל", "מעבר", "קומה")


def legend_row_is_description(row: dict, catalog: list[CatalogType]) -> bool:
    """A legend row names the symbol. A floor note, a cable note, or a circuit label does not."""
    text = legend_match_text(row)
    if not text.strip():
        return False
    folded = text.casefold()
    if any(marker in folded for marker in _NOTE_MARKERS):
        return False
    return match_legend_text(text, catalog) is not None


def _is_note(row: dict) -> bool:
    text = legend_match_text(row).casefold()
    return any(marker in text for marker in _NOTE_MARKERS)


def accepted_legend_rows(rows: list[dict], catalog: list[CatalogType]) -> list[dict]:
    """A symbol description is kept even when the catalog has no type for it.

    A floor note, a cable note, or a jumper note is not a legend row.
    """
    del catalog
    kept: list[dict] = []
    for row in rows:
        text = str(row.get("decodedText") or row.get("rawText") or "").strip()
        if not text or _is_note(row):
            continue
        kept.append(row)
    return kept


def type_map_from_legend_rows(
    rows: list[dict],
    catalog: list[CatalogType],
) -> dict[str, tuple[str, str]]:
    """signature → (typeKey, confidence). Conflicting texts for one block stay unmapped."""
    grouped: dict[str, list] = {}
    for row in rows:
        if row.get("continuation"):
            continue
        text = legend_match_text(row)
        if not text.strip():
            continue
        match = match_legend_text(text, catalog)
        if match is None or not match.type_key:
            continue
        sig = str(row.get("signature") or "")
        if not sig:
            continue
        grouped.setdefault(sig, []).append(match)

    out: dict[str, tuple[str, str]] = {}
    for sig, matches in grouped.items():
        keys = {m.type_key for m in matches}
        if len(keys) != 1:
            continue
        best = max(matches, key=lambda m: m.score)
        conf = best.confidence if best.confidence in _CONF else "low"
        if any(m.ambiguous for m in matches):
            conf = "low"
        if conf == "none":
            continue
        out[sig] = (best.type_key, conf)
        out[sig.lower()] = (best.type_key, conf)
    return out


def socket_bank_signatures(rows: list[dict]) -> set[str]:
    """Blocks whose legend is a socket bank. typeKey stays empty; quantity stays unknown.

    An explicit '4 שקעים' is recorded by ``stated_socket_count`` and is still not a
    guessed multiplier and not ``power.socket.single``.
    """
    out: set[str] = set()
    for row in rows:
        text = legend_match_text(row)
        if not text.strip() or not is_socket_bank(text):
            continue
        sig = str(row.get("signature") or "")
        if not sig:
            continue
        out.add(sig)
        out.add(sig.lower())
    return out
