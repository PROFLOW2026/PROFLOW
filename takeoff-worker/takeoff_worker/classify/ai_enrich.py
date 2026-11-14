"""Optional AI legend reading (legend crops only)."""
from __future__ import annotations

from ..ai.legend_reader import LegendReader
from ..models import WorkerLegendEntry


def ai_rows_for_legend(
    entries: list[WorkerLegendEntry],
    artifacts: dict[str, bytes],
    reader: LegendReader,
) -> dict[int, list]:
    out: dict[int, list] = {}
    for row in entries:
        if row.rowIndex is None or not row.previewArtifact:
            continue
        blob = artifacts.get(row.previewArtifact)
        if not blob:
            continue
        text = row.decodedText or row.rawText or ""
        for r in reader.read(blob, text):
            out.setdefault(int(row.rowIndex), []).append(r)
    return out