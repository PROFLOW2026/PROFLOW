"""Sheet scale hints from PDF text layer."""
from __future__ import annotations

import re

from takeoff_worker.models import SheetScale

_SCALE_RE = re.compile(r"1\s*:\s*(\d+)", re.I)
_KNAM_RE = re.compile(r'קנ"מ|קנ״מ|קנמ', re.I)


def parse_scale(text: str) -> SheetScale:
    if not text:
        return SheetScale(verified=False, source="none")
    ratios: list[float] = []
    for m in _SCALE_RE.finditer(text):
        try:
            ratios.append(float(m.group(1)))
        except ValueError:
            continue
    verified = len(set(ratios)) == 1 and len(ratios) >= 2
    ratio = ratios[0] if ratios else None
    if ratio is None and _KNAM_RE.search(text):
        return SheetScale(ratio=None, verified=False, source="title_text", note="scale_keyword_without_ratio")
    if ratio is not None:
        return SheetScale(ratio=ratio, verified=verified, source="title_text", note=None if verified else "single_source")
    return SheetScale(verified=False, source="none")