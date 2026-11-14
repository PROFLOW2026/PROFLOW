"""Engine interfaces (lead-owned). PDF engine (agent 1) and DWG engine (agent 2) implement these; the pipeline
(agent 3) calls them; the HTTP server (agent 5) only calls the pipeline.

Rules
- Engines are PURE with respect to the network: they read local file paths and return data. No HTTP, no DB.
- Detection coordinates are in PREVIEW PIXEL SPACE of the sheet (origin top-left) - the same raster the engine
  renders as `previewArtifact`. Native coordinates go to `Detection.native`.
- Engines never decide catalog types except via the planner library (`classifiedBy="library"`). Everything else leaves
  `typeKey=None`, sets `rawClass`/`signature`, and the pipeline's classify stage maps it using legend text/catalog/AI.
- Never invent: when unsure set confidence low/none and add review `reasons`.
- Failures per sheet must not abort the file: return the sheet with analyzed="partial"/"skipped" + note + a warning.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Protocol

from .models import (
    JobOptions, SymbolLibraryEntry, WorkerDetection, WorkerLegendEntry, WorkerLinear, WorkerSheet, WorkerWarning,
)

ProgressFn = Callable[[str, float, Optional[str]], None]  # (stage, percent 0-100 within this call, message)


@dataclass
class EngineOutput:
    sheets: list[WorkerSheet] = field(default_factory=list)
    detections: list[WorkerDetection] = field(default_factory=list)
    legend: list[WorkerLegendEntry] = field(default_factory=list)
    linear: list[WorkerLinear] = field(default_factory=list)
    warnings: list[WorkerWarning] = field(default_factory=list)
    #: artifact name -> bytes (PNG previews, legend crops). Names referenced by sheets/legend.
    artifacts: dict[str, bytes] = field(default_factory=dict)
    versions: dict[str, str] = field(default_factory=dict)
    stats: dict[str, float] = field(default_factory=dict)


@dataclass
class LegendTemplate:
    """A legend symbol learned from ANOTHER file/sheet (e.g. a separate legend PDF). Produced by the PDF engine from a
    legend sheet (`templates_from_output`), consumed by the PDF engine when analysing plan sheets of the same planner.
    Masks are scale/rotation normalised (64x64, min-enclosing-circle) exactly like SymbolTemplate."""
    key: str  # legend row key, e.g. 'L7'
    source_file_id: str
    mask_b64: str
    color_hex: Optional[str] = None
    radius_pt: Optional[float] = None  # symbol radius in the legend page's own units (for the size-ratio gate)
    tag_text: Optional[str] = None  # e.g. 'T22' printed beside the legend symbol
    decoded_text: Optional[str] = None


class PdfEngine(Protocol):
    def analyze(
        self,
        path: str,
        file_id: str,
        *,
        options: JobOptions,
        library: list[SymbolLibraryEntry],
        extra_templates: Optional[list[LegendTemplate]] = None,
        sheet_keys: Optional[set[str]] = None,
        progress: Optional[ProgressFn] = None,
    ) -> EngineOutput: ...


class DwgEngine(Protocol):
    def analyze(
        self,
        path: str,
        file_id: str,
        *,
        kind: str,  # 'dwg' | 'dxf'
        xref_paths: dict[str, str],  # xref name -> local path (provided by the user); missing ones are reported
        options: JobOptions,
        library: list[SymbolLibraryEntry],
        sheet_keys: Optional[set[str]] = None,
        progress: Optional[ProgressFn] = None,
    ) -> EngineOutput: ...
