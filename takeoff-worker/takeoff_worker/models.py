"""Worker protocol models - MIRROR of src/modules/electrical-takeoff/domain/contracts.ts (contract v2).

Field names are intentionally camelCase so the JSON on the wire is identical on both sides.
Owner: lead. Add optional fields only; never rename/remove/retype without the lead (bump CONTRACT_VERSION on both sides).
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = 2

SourceKind = Literal["pdf", "dwg", "dxf"]
Confidence = Literal["high", "medium", "low", "none"]
ReviewReason = Literal[
    "low_confidence", "unclassified", "type_ambiguous", "possible_duplicate", "xref_missing",
    "dynamic_block_unresolved", "scale_unverified", "sheet_partial", "tag_unread", "pdf_dwg_mismatch",
    "pdf_only", "dwg_only", "legend_unmapped", "overlapping_symbols_peeled", "possible_exploded_symbol",
    "legend_zone",
    "legend_text_undecodable",
    "symbol_group_candidate",
    "drawing_noise",
]
ElectricalCategory = Literal[
    "lighting", "emergency_lighting", "power", "communication", "low_voltage", "fire_detection",
    "panels_distribution", "control", "conduit_tray", "other", "unknown",
]
ComponentRole = Literal["fixture", "device", "equipment", "point", "linear"]
SignatureKind = Literal["pdf-shape", "dwg-block", "legend-key"]
JobStage = Literal["queued", "downloading", "detect_type", "sheets", "legend", "extract", "classify", "merge", "render", "upload", "done"]


class _M(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class CatalogType(_M):
    key: str
    category: ElectricalCategory
    role: ComponentRole
    nameHe: str
    nameEn: Optional[str] = None
    unit: str = "יח'"
    keywordsHe: list[str] = Field(default_factory=list)
    colorHex: str = "#2563eb"
    builtIn: bool = True
    archived: bool = False


class SymbolTemplate(_M):
    size: Literal[64] = 64
    maskB64: str
    colorHex: Optional[str] = None


class SymbolLibraryEntry(_M):
    id: str
    plannerKey: str
    signatureKind: SignatureKind
    signature: str
    template: Optional[SymbolTemplate] = None
    typeKey: str
    label: Optional[str] = None
    createdAtIso: Optional[str] = None


class XrefRef(_M):
    name: str
    downloadUrl: str


class WorkerFile(_M):
    fileId: str
    name: str
    kind: SourceKind
    sizeBytes: int
    sha256: Optional[str] = None
    downloadUrl: str
    xrefs: list[XrefRef] = Field(default_factory=list)


class WorkerCallback(_M):
    progressUrl: str
    resultUrl: str
    artifactUrl: str
    token: str


class Pairing(_M):
    pdfFileId: str
    dwgFileId: str


class SheetSelection(_M):
    fileId: str
    sheetKey: str


class LegendRegionHint(_M):
    fileId: str
    sheetKey: str
    legend: Optional[tuple[float, float, float, float]] = None
    plan: Optional[tuple[float, float, float, float]] = None


class JobOptions(_M):
    previewMaxEdgePx: int = 6000
    renderPreview: bool = True
    useAi: bool = False
    legendRegionHints: list[LegendRegionHint] = Field(default_factory=list)


class WorkerJobRequest(_M):
    contractVersion: Literal[2] = 2
    jobId: str
    plannerKey: str = "unknown"
    files: list[WorkerFile]
    pairing: list[Pairing] = Field(default_factory=list)
    sheetSelection: list[SheetSelection] = Field(default_factory=list)
    options: JobOptions = Field(default_factory=JobOptions)
    catalog: list[CatalogType] = Field(default_factory=list)
    symbolLibrary: list[SymbolLibraryEntry] = Field(default_factory=list)
    callback: WorkerCallback


class WorkerProgress(_M):
    jobId: str
    stage: JobStage
    percent: float
    message: Optional[str] = None
    fileId: Optional[str] = None
    sheetKey: Optional[str] = None


class SheetScale(_M):
    ratio: Optional[float] = None
    metersPerPreviewPx: Optional[float] = None
    verified: bool = False
    source: Literal["title_text", "dimension", "insunits", "user", "none"] = "none"
    note: Optional[str] = None


class XrefMissing(_M):
    name: str
    path: Optional[str] = None


class WorkerSheet(_M):
    sheetKey: str
    fileId: str
    name: str
    kind: Literal["pdf_page", "dwg_layout", "dwg_model"]
    index: int
    widthPx: int
    heightPx: int
    previewArtifact: Optional[str] = None
    scale: SheetScale = Field(default_factory=SheetScale)
    analyzed: Literal["full", "partial", "skipped"] = "full"
    note: Optional[str] = None
    floorHint: Optional[str] = None
    xrefsMissing: list[XrefMissing] = Field(default_factory=list)
    hiddenByLayers: int = 0


class Native(_M):
    x: float
    y: float


class WorkerDetection(_M):
    id: str
    sheetKey: str
    fileId: str
    source: Literal["pdf", "dwg"]
    x: float
    y: float
    w: float = 0.0
    h: float = 0.0
    angleDeg: Optional[float] = None
    signature: str
    signatureKind: SignatureKind
    rawClass: str
    legendKey: Optional[str] = None
    blockName: Optional[str] = None
    layer: Optional[str] = None
    colorHex: Optional[str] = None
    tagText: Optional[str] = None
    typeKey: Optional[str] = None
    classifiedBy: Literal["library", "dwg_block_map", "legend_text", "ai", "shape_cluster", "none"] = "none"
    confidence: Confidence = "none"
    score: Optional[float] = None
    margin: Optional[float] = None
    reasons: list[ReviewReason] = Field(default_factory=list)
    twinId: Optional[str] = None
    maskB64: Optional[str] = None
    native: Optional[Native] = None


class LegendTextBox(_M):
    x0: float
    y0: float
    x1: float
    y1: float


class WorkerLegendEntry(_M):
    key: str
    fileId: str
    sheetKey: Optional[str] = None
    rowIndex: Optional[int] = None
    rawText: Optional[str] = None
    decodedText: Optional[str] = None
    decodedBy: Optional[Literal["pdf_text", "dwg_kbd", "ai", "none"]] = None
    textBox: Optional[LegendTextBox] = None
    reasons: list[ReviewReason] = Field(default_factory=list)
    signature: str
    signatureKind: SignatureKind
    previewArtifact: Optional[str] = None
    typeKey: Optional[str] = None
    confidence: Optional[Confidence] = None
    count: Optional[int] = None


class WorkerLinear(_M):
    id: str
    sheetKey: str
    fileId: str
    layer: Optional[str] = None
    typeKey: Optional[str] = None
    points: list[tuple[float, float]]
    lengthMeters: Optional[float] = None
    lengthPreviewPx: float
    scaleVerified: bool


class WorkerWarning(_M):
    code: str
    severity: Literal["info", "warning", "error"] = "warning"
    message: str
    fileId: Optional[str] = None
    sheetKey: Optional[str] = None


class WorkerError(_M):
    code: str
    message: str
    fileId: Optional[str] = None
    sheetKey: Optional[str] = None


class WorkerResult(_M):
    contractVersion: Literal[2] = 2
    jobId: str
    status: Literal["succeeded", "partial", "failed"]
    startedAtIso: str
    finishedAtIso: str
    engineVersions: dict[str, str] = Field(default_factory=dict)
    sheets: list[WorkerSheet] = Field(default_factory=list)
    detections: list[WorkerDetection] = Field(default_factory=list)
    legend: list[WorkerLegendEntry] = Field(default_factory=list)
    linear: list[WorkerLinear] = Field(default_factory=list)
    warnings: list[WorkerWarning] = Field(default_factory=list)
    errors: list[WorkerError] = Field(default_factory=list)
    stats: dict[str, float] = Field(default_factory=dict)


class TypeStyle(_M):
    typeKey: Optional[str] = None
    label: str
    colorHex: str


class ExportDetection(_M):
    id: str
    x: float
    y: float
    w: float
    h: float
    typeKey: Optional[str] = None
    confidence: Confidence


class BoqSummaryRow(_M):
    label: str
    quantity: float
    unit: str


class ExportAnnotatedPdfRequest(_M):
    contractVersion: Literal[2] = 2
    file: WorkerFile
    sheet: WorkerSheet
    detections: list[ExportDetection]
    styles: list[TypeStyle]
    title: str
    boqSummary: list[BoqSummaryRow] = Field(default_factory=list)


class BoqPdfLine(_M):
    label: str
    category: str
    unit: str
    quantity: float
    floor: Optional[str] = None
    area: Optional[str] = None
    status: str


class ExportBoqPdfRequest(_M):
    contractVersion: Literal[2] = 2
    title: str
    subtitle: Optional[str] = None
    approved: bool
    generatedAtIso: str
    limitations: list[str]
    lines: list[BoqPdfLine]
