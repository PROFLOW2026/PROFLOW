/**
 * Electrical takeoff ("כתב כמויות חכם לחשמל") - SHARED CONTRACTS.
 *
 * Single source of truth for:
 *   1. the worker protocol (app <-> Python `takeoff-worker`), mirrored by
 *      `takeoff-worker/takeoff_worker/models.py` (pydantic). A contract test feeds Python-produced JSON
 *      fixtures through these schemas - change both sides together and bump TAKEOFF_CONTRACT_VERSION.
 *   2. the DTOs that the UI consumes and the server actions return (`TakeoffClientApi`).
 *
 * Pure (no I/O, no server-only imports): safe in client bundles and in unit tests.
 * Owner: lead. Agents may ADD optional fields; they must not rename/remove/retype fields without the lead.
 */
import { z } from 'zod';

export const TAKEOFF_CONTRACT_VERSION = 2;

/* ----------------------------------------------------------------------------------------------- */
/* Vocabulary                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

export const sourceKindSchema = z.enum(['pdf', 'dwg', 'dxf']);
export type TakeoffSourceKind = z.infer<typeof sourceKindSchema>;

/** Detection confidence. `none` = the engine could not classify (always needs a human). */
export const confidenceSchema = z.enum(['high', 'medium', 'low', 'none']);
export type TakeoffConfidence = z.infer<typeof confidenceSchema>;

/** Why a detection must be looked at by a human. A detection with any reason is "needs review". */
export const reviewReasonSchema = z.enum([
  'low_confidence',
  'unclassified',
  'type_ambiguous', // geometry-identical symbols (e.g. T20 vs T22) - tag text decides
  'possible_duplicate', // same block/layer/position/rotation more than once, or PDF/DWG double hit
  'xref_missing', // symbol may live in an Xref file that was not provided
  'dynamic_block_unresolved',
  'scale_unverified',
  'sheet_partial',
  'tag_unread',
  'pdf_dwg_mismatch',
  'pdf_only', // PDF plan symbol with no DWG twin after merge
  'dwg_only', // DWG plan symbol with no PDF twin after merge
  'legend_unmapped', // legend row has no catalog type yet
  'overlapping_symbols_peeled',
  'possible_exploded_symbol',
  /** In-sheet margin legend / title block — not a plan quantity (BOQ excludes). */
  'legend_zone',
  /** Legend row description could not be decoded from PDF text layer (mojibake / outline glyphs). */
  'legend_text_undecodable',
  /** Unclassified plan symbol grouped by shape signature for review / library naming. */
  'symbol_group_candidate',
  /** Line, text, or near-empty vector fragment. Not an electrical device and not counted. */
  'drawing_noise',
]);
export type TakeoffReviewReason = z.infer<typeof reviewReasonSchema>;

export const electricalCategorySchema = z.enum([
  'lighting',
  'emergency_lighting',
  'power', // sockets, power points
  'communication', // data, phone, TV, intercom
  'low_voltage', // sensors, access control, CCTV, speakers
  'fire_detection', // detectors, call points, sirens
  'panels_distribution',
  'control', // switches, dimmers, shutters, KNX
  'conduit_tray', // linear: trays, conduits, cables
  'other',
  'unknown',
]);
export type ElectricalCategory = z.infer<typeof electricalCategorySchema>;

/**
 * Separation required by the Owner: a DETECTION is a drawn symbol. What gets priced is decided by
 * the type's role and the measurement rule set - three sockets in one spot are three devices but not
 * necessarily three priced points.
 */
export const componentRoleSchema = z.enum([
  'fixture', // גוף תאורה
  'device', // אביזר (socket, switch, detector, ...)
  'equipment', // panel, UPS, generator, ...
  'point', // נקודה לתמחור - produced by a measurement rule, never drawn
  'linear', // length-based item
]);
export type ComponentRole = z.infer<typeof componentRoleSchema>;

export const lineKindSchema = z.enum(['fixture_count', 'device_count', 'equipment_count', 'point_count', 'length', 'manual']);
export type BoqLineKind = z.infer<typeof lineKindSchema>;

export const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']);
export type TakeoffJobStatus = z.infer<typeof jobStatusSchema>;

export const analysisStatusSchema = z.enum(['draft', 'processing', 'in_review', 'approved']);
export type TakeoffAnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const jobStageSchema = z.enum([
  'queued',
  'downloading',
  'detect_type',
  'sheets',
  'legend',
  'extract',
  'classify',
  'merge',
  'render',
  'upload',
  'done',
]);
export type TakeoffJobStage = z.infer<typeof jobStageSchema>;

/* ----------------------------------------------------------------------------------------------- */
/* Catalog / symbol library / measurement rules                                                    */
/* ----------------------------------------------------------------------------------------------- */

export const catalogTypeSchema = z.object({
  key: z.string().min(1).max(80), // stable, dotted: 'light.recessed', 'power.socket.single'
  category: electricalCategorySchema,
  role: componentRoleSchema,
  nameHe: z.string().min(1),
  nameEn: z.string().optional(),
  unit: z.string().default("יח'"),
  /** Hebrew keywords used for rule-based legend text -> type mapping (decoded text, any order). */
  keywordsHe: z.array(z.string()).default([]),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'),
  builtIn: z.boolean().default(true),
  archived: z.boolean().default(false),
});
export type CatalogType = z.infer<typeof catalogTypeSchema>;

export const symbolSignatureKindSchema = z.enum(['pdf-shape', 'dwg-block', 'legend-key']);

/** One learned mapping, scoped to a planner (never global). Sent to the worker with every job. */
export const symbolLibraryEntrySchema = z.object({
  id: z.string(),
  plannerKey: z.string().min(1),
  signatureKind: symbolSignatureKindSchema,
  /** pdf-shape: 'shape:<sha1 of normalized mask>'; dwg-block: 'block:<trueName>'; legend-key: 'legend:<text hash>' */
  signature: z.string().min(1),
  /** pdf-shape only: 64x64 1-bit mask (row-major, base64 of packed bits) + dominant colour used for the colour gate. */
  template: z
    .object({ size: z.literal(64), maskB64: z.string(), colorHex: z.string().nullable().optional() })
    .nullable()
    .optional(),
  /** DWG block-definition fingerprint. A library hit applies only when this matches the drawing. */
  geometryHash: z.string().min(8).optional(),
  typeKey: z.string().min(1),
  label: z.string().optional(),
  createdAtIso: z.string().optional(),
});
export type SymbolLibraryEntry = z.infer<typeof symbolLibraryEntrySchema>;

/** A rule decides how detections become priced quantities. Default rule set = count every detection once. */
export const measurementRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  appliesTo: z.object({
    categories: z.array(electricalCategorySchema).optional(),
    typeKeys: z.array(z.string()).optional(),
  }),
  mode: z.enum([
    'count_each', // each detection is one unit
    'group_by_proximity', // detections closer than the radius collapse into one unit (a "point")
    'exclude', // not priced (kept visible, listed as excluded)
  ]),
  /** For group_by_proximity. Meters need a verified sheet scale; px works always (preview pixels). */
  proximity: z.object({ radiusMeters: z.number().positive().optional(), radiusPx: z.number().positive().optional() }).optional(),
  output: z.object({ lineKind: lineKindSchema.optional(), label: z.string().optional(), pricingKey: z.string().optional() }),
});
export type MeasurementRule = z.infer<typeof measurementRuleSchema>;

export const measurementRuleSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(['default', 'organization', 'project', 'analysis']),
  version: z.number().int().nonnegative(),
  rules: z.array(measurementRuleSchema),
});
export type MeasurementRuleSet = z.infer<typeof measurementRuleSetSchema>;

/* ----------------------------------------------------------------------------------------------- */
/* Worker protocol                                                                                 */
/* ----------------------------------------------------------------------------------------------- */

export const workerFileSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  kind: sourceKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().optional(),
  /** Short-lived URL the worker GETs (served by the app from the organization's own storage). */
  downloadUrl: z.string(),
  /** Xref files provided by the user for this DWG (name -> url). Missing ones are reported as warnings. */
  xrefs: z.array(z.object({ name: z.string(), downloadUrl: z.string() })).default([]),
});

export const workerCallbackSchema = z.object({
  progressUrl: z.string(),
  resultUrl: z.string(),
  artifactUrl: z.string(),
  /** Bearer token, single job, expires; the worker never sees user sessions or provider tokens. */
  token: z.string(),
});

export const workerJobRequestSchema = z.object({
  contractVersion: z.literal(TAKEOFF_CONTRACT_VERSION),
  jobId: z.string(),
  plannerKey: z.string().default('unknown'),
  files: z.array(workerFileSchema).min(1),
  /** Pair a PDF with the DWG it was plotted from (same project): enables cross-check + merge. */
  pairing: z.array(z.object({ pdfFileId: z.string(), dwgFileId: z.string() })).default([]),
  /** Restrict analysis. Empty = every sheet found. sheetKey as returned by an earlier job. */
  sheetSelection: z.array(z.object({ fileId: z.string(), sheetKey: z.string() })).default([]),
  options: z
    .object({
      previewMaxEdgePx: z.number().int().min(1000).max(12000).default(6000),
      renderPreview: z.boolean().default(true),
      /** AI legend/text reading. Off unless the Owner configured a provider (cost). */
      useAi: z.boolean().default(false),
      legendRegionHints: z
        .array(z.object({ fileId: z.string(), sheetKey: z.string(), legend: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(), plan: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }))
        .default([]),
    })
    .default({ previewMaxEdgePx: 6000, renderPreview: true, useAi: false, legendRegionHints: [] }),
  catalog: z.array(catalogTypeSchema),
  symbolLibrary: z.array(symbolLibraryEntrySchema).default([]),
  callback: workerCallbackSchema,
});
export type WorkerJobRequest = z.infer<typeof workerJobRequestSchema>;

export const workerProgressSchema = z.object({
  jobId: z.string(),
  stage: jobStageSchema,
  percent: z.number().min(0).max(100),
  message: z.string().nullish(),
  fileId: z.string().nullish(),
  sheetKey: z.string().nullish(),
});
export type WorkerProgress = z.infer<typeof workerProgressSchema>;

/** Scale of a sheet. `verified` is true ONLY when two independent sources agree or the user confirmed it. */
export const sheetScaleSchema = z.object({
  ratio: z.number().positive().nullable(), // 100 for 1:100
  metersPerPreviewPx: z.number().positive().nullable(),
  verified: z.boolean(),
  source: z.enum(['title_text', 'dimension', 'insunits', 'user', 'none']),
  note: z.string().nullish(),
});
export type SheetScale = z.infer<typeof sheetScaleSchema>;

export const workerSheetSchema = z.object({
  sheetKey: z.string(), // stable across re-analysis of the same file: 'p1', 'layout:<name>', 'model'
  fileId: z.string(),
  name: z.string(),
  kind: z.enum(['pdf_page', 'dwg_layout', 'dwg_model']),
  index: z.number().int().nonnegative(),
  widthPx: z.number().int().positive(), // preview raster size; detection coordinates live in this space
  heightPx: z.number().int().positive(),
  previewArtifact: z.string().nullable(), // artifact name posted to artifactUrl
  scale: sheetScaleSchema,
  analyzed: z.enum(['full', 'partial', 'skipped']),
  note: z.string().nullish(), // why partial/skipped (Hebrew-safe plain text)
  floorHint: z.string().nullish(),
  xrefsMissing: z.array(z.object({ name: z.string(), path: z.string().nullish() })).default([]),
  /** Hidden by frozen/off layers in the sheet viewport and therefore NOT counted (DWG). */
  hiddenByLayers: z.number().int().nonnegative().default(0),
});
export type WorkerSheet = z.infer<typeof workerSheetSchema>;

export const workerDetectionSchema = z.object({
  id: z.string(), // unique within the job: '<sheetKey>#<n>'
  sheetKey: z.string(),
  fileId: z.string(),
  source: z.enum(['pdf', 'dwg']),
  /** Preview pixel space, origin top-left. (x,y) = centre. */
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  angleDeg: z.number().nullable().optional(),
  /** Stable identity of the symbol design, used to match the planner's library. See symbolLibraryEntry. */
  signature: z.string(),
  signatureKind: symbolSignatureKindSchema,
  /** Engine-level raw class: DWG block true name, or PDF legend row key ('L7'). */
  rawClass: z.string(),
  legendKey: z.string().optional(),
  blockName: z.string().optional(),
  layer: z.string().optional(),
  colorHex: z.string().optional(),
  tagText: z.string().optional(), // e.g. 'T22', '3a' read next to the symbol
  /** Catalog type proposed by the worker. null = not classified. */
  typeKey: z.string().nullable(),
  classifiedBy: z.enum(['library', 'dwg_block_map', 'legend_text', 'ai', 'shape_cluster', 'none']),
  confidence: confidenceSchema,
  score: z.number().optional(), // engine match score, lower is better
  margin: z.number().optional(),
  reasons: z.array(reviewReasonSchema).default([]),
  /** When PDF and DWG detections were merged: ids of the twin (same physical symbol). */
  twinId: z.string().optional(),
  /** 64×64 packed symbol mask (same encoding as SymbolTemplate.maskB64), when the engine stored it. */
  maskB64: z.string().optional(),
  /** Fingerprint of the DWG block definition. Rotation, scale and mirror of an insert do not change it. */
  geometryHash: z.string().min(8).optional(),
  native: z.object({ x: z.number(), y: z.number() }).optional(), // pdf pt (unrotated page) or dwg model units
});
export type WorkerDetection = z.infer<typeof workerDetectionSchema>;

const legendTextBoxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const workerLegendEntrySchema = z.object({
  key: z.string(), // 'L7' for pdf rows; 'block:<name>' for dwg legend blocks
  fileId: z.string(),
  sheetKey: z.string().nullish(),
  rowIndex: z.number().int().nonnegative().nullish(),
  rawText: z.string().nullish(), // as found (visual order / kbd-encoded)
  decodedText: z.string().nullish(), // logical Hebrew after reversal / keyboard decode / AI
  decodedBy: z.enum(['pdf_text', 'dwg_kbd', 'ai', 'none']).nullish(),
  textBox: legendTextBoxSchema.nullable().optional(), // display-pt bounds of description text next to symbol
  reasons: z.array(reviewReasonSchema).optional().default([]),
  signature: z.string(),
  signatureKind: symbolSignatureKindSchema,
  previewArtifact: z.string().nullable().optional(), // cropped symbol png
  typeKey: z.string().nullable().optional(),
  confidence: confidenceSchema.optional(),
  count: z.number().int().nonnegative().nullish(),
});
export type WorkerLegendEntry = z.infer<typeof workerLegendEntrySchema>;

/** Length of a linear element (tray / conduit / cable run) - only when geometry is reliable. */
export const workerLinearSchema = z.object({
  id: z.string(),
  sheetKey: z.string(),
  fileId: z.string(),
  layer: z.string().optional(),
  typeKey: z.string().nullable(),
  points: z.array(z.tuple([z.number(), z.number()])).min(2), // preview px polyline
  lengthMeters: z.number().nonnegative().nullable(), // null when scale is unverified
  lengthPreviewPx: z.number().nonnegative(),
  scaleVerified: z.boolean(),
});
export type WorkerLinear = z.infer<typeof workerLinearSchema>;

export const workerWarningSchema = z.object({
  code: z.string(), // 'xref_missing' | 'sheet_partial' | 'dwg_unstable_objects' | ...
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  fileId: z.string().nullish(),
  sheetKey: z.string().nullish(),
});
export type WorkerWarning = z.infer<typeof workerWarningSchema>;

/** Worker-originated warnings/errors surfaced on {@link AnalysisView.workerWarnings} (latest successful job). */
export const analysisWorkerWarningSchema = workerWarningSchema;
export type AnalysisWorkerWarning = z.infer<typeof analysisWorkerWarningSchema>;

export const workerResultSchema = z.object({
  contractVersion: z.literal(TAKEOFF_CONTRACT_VERSION),
  jobId: z.string(),
  status: z.enum(['succeeded', 'partial', 'failed']),
  startedAtIso: z.string(),
  finishedAtIso: z.string(),
  engineVersions: z.record(z.string(), z.string()).default({}),
  sheets: z.array(workerSheetSchema),
  detections: z.array(workerDetectionSchema),
  legend: z.array(workerLegendEntrySchema).default([]),
  linear: z.array(workerLinearSchema).default([]),
  warnings: z.array(workerWarningSchema).default([]),
  errors: z.array(z.object({ code: z.string(), message: z.string(), fileId: z.string().optional(), sheetKey: z.string().optional() })).default([]),
  stats: z.record(z.string(), z.number()).default({}),
});
export type WorkerResult = z.infer<typeof workerResultSchema>;

/* Export endpoints of the worker (the app passes data; the worker draws and returns bytes). */
export const typeStyleSchema = z.object({ typeKey: z.string().nullable(), label: z.string(), colorHex: z.string() });
export const exportAnnotatedPdfRequestSchema = z.object({
  contractVersion: z.literal(TAKEOFF_CONTRACT_VERSION),
  file: workerFileSchema,
  sheet: workerSheetSchema,
  detections: z.array(workerDetectionSchema.pick({ id: true, x: true, y: true, w: true, h: true, typeKey: true, confidence: true })),
  styles: z.array(typeStyleSchema),
  title: z.string(),
  boqSummary: z.array(z.object({ label: z.string(), quantity: z.number(), unit: z.string() })).default([]),
});
export type ExportAnnotatedPdfRequest = z.infer<typeof exportAnnotatedPdfRequestSchema>;

export const exportBoqPdfRequestSchema = z.object({
  contractVersion: z.literal(TAKEOFF_CONTRACT_VERSION),
  title: z.string(),
  subtitle: z.string().optional(),
  approved: z.boolean(),
  generatedAtIso: z.string(),
  limitations: z.array(z.string()),
  lines: z.array(z.object({ label: z.string(), category: z.string(), unit: z.string(), quantity: z.number(), floor: z.string().optional(), area: z.string().optional(), status: z.string() })),
});
export type ExportBoqPdfRequest = z.infer<typeof exportBoqPdfRequestSchema>;

/* ----------------------------------------------------------------------------------------------- */
/* App DTOs (what server actions return and the UI renders)                                        */
/* ----------------------------------------------------------------------------------------------- */

export const detectionOriginSchema = z.enum(['auto', 'user_added', 'user_changed']);
export type DetectionOrigin = z.infer<typeof detectionOriginSchema>;
export const detectionStatusSchema = z.enum(['suggested', 'confirmed']);
export type DetectionStatus = z.infer<typeof detectionStatusSchema>;

export const effectiveDetectionSchema = z.object({
  id: z.string(),
  sheetKey: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  typeKey: z.string().nullable(),
  origin: detectionOriginSchema,
  status: detectionStatusSchema,
  confidence: confidenceSchema,
  reasons: z.array(reviewReasonSchema),
  rawClass: z.string(),
  tagText: z.string().nullable(),
  /** Stable symbol identity from the worker. Missing on a hand-added mark, so it cannot be saved to the library. */
  signature: z.string().min(1).nullable().optional(),
  source: z.enum(['pdf', 'dwg', 'manual', 'merged']),
  areaId: z.string().nullable(),
  needsReview: z.boolean(),
  /** DWG model units (or PDF points) from the worker. Absent after a manual move. */
  native: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type EffectiveDetection = z.infer<typeof effectiveDetectionSchema>;

export const sheetDtoSchema = workerSheetSchema.omit({ previewArtifact: true }).extend({
  /** Relative URL served by the app route (permission-checked): /api/takeoff/artifact/<id> */
  previewUrl: z.string().nullable(),
  floorLabel: z.string().nullable(),
});
export type SheetDto = z.infer<typeof sheetDtoSchema>;

export const areaSchema = z.object({
  id: z.string(),
  sheetKey: z.string(),
  name: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3), // preview px
});
export type TakeoffArea = z.infer<typeof areaSchema>;

export const boqLineSchema = z.object({
  key: z.string(), // deterministic: '<lineKind>|<typeKey>|<floor>|<areaId>|<ruleId>'
  typeKey: z.string().nullable(),
  label: z.string(),
  category: electricalCategorySchema,
  lineKind: lineKindSchema,
  unit: z.string(),
  quantity: z.number(),
  /** Drawn symbols in this line. Differs from `quantity` when an X2 note makes one symbol two devices. */
  symbolCount: z.number().optional(),
  floor: z.string().nullable(),
  areaId: z.string().nullable(),
  ruleId: z.string().nullable(),
  detectionIds: z.array(z.string()),
  breakdown: z.object({ high: z.number(), medium: z.number(), low: z.number(), unclassified: z.number(), userAdded: z.number(), userConfirmed: z.number() }),
  /** `verified` is TRUE only for an approved analysis and a line with no unresolved review items. Never invent. */
  verified: z.boolean(),
  excluded: z.boolean().default(false),
});
export type BoqLine = z.infer<typeof boqLineSchema>;

export const boqSchema = z.object({
  lines: z.array(boqLineSchema),
  unclassifiedCount: z.number(),
  needsReviewCount: z.number(),
  completeness: z.object({
    sheetsTotal: z.number(),
    sheetsFullyAnalyzed: z.number(),
    partialSheets: z.array(z.string()),
    skippedSheets: z.array(z.string()),
    xrefsMissing: z.array(z.string()),
    scaleUnverifiedSheets: z.array(z.string()),
  }),
  warnings: z.array(z.string()),
  state: z.enum(['draft', 'approved']),
  counting: z
    .object({
      countedTotal: z.number(),
      countedBySource: z.object({
        pdf: z.number(),
        dwg: z.number(),
        manual: z.number(),
        merged: z.number(),
      }),
      excluded: z.object({
        legendZone: z.number(),
        pdfOnly: z.number(),
        hiddenLayersOnSheets: z.number(),
        sheetExcluded: z.number().optional(),
      }),
      twinsCollapsed: z.number().optional(),
      composition: z
        .object({
          dwgCounted: z.number(),
          pdfCounted: z.number(),
          unpairedPdfExcluded: z.number(),
        })
        .optional(),
    })
    .optional(),
});
export type Boq = z.infer<typeof boqSchema>;

export const jobDtoSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
  stage: jobStageSchema,
  percent: z.number(),
  message: z.string().nullable(),
  startedAtIso: z.string().nullable(),
  finishedAtIso: z.string().nullable(),
  error: z.string().nullable(),
  /** Numeric pipeline stats from the last ingested worker result (timings, classified %, …). */
  stats: z.record(z.string(), z.number()).optional(),
});
export type TakeoffJobDto = z.infer<typeof jobDtoSchema>;

export const fileDtoSchema = z.object({ id: z.string(), name: z.string(), kind: sourceKindSchema, sizeBytes: z.number(), uploadedAtIso: z.string(), sha256: z.string().nullable() });
export type TakeoffFileDto = z.infer<typeof fileDtoSchema>;

export const takeoffPersistenceModeSchema = z.enum(['persistent', 'ephemeral']);
export type TakeoffPersistenceMode = z.infer<typeof takeoffPersistenceModeSchema>;

export const analysisSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: analysisStatusSchema,
  plannerKey: z.string(),
  revision: z.number().int(),
  updatedAtIso: z.string(),
  fileCount: z.number(),
  approvedAtIso: z.string().nullable(),
  persistenceMode: takeoffPersistenceModeSchema.default('persistent'),
  archivedAtIso: z.string().nullable().optional(),
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

/** User edits are APPEND-ONLY events; the effective state is `applyEdits(base, edits)` (pure, see edits.ts). */
export const takeoffEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reclassify'), detectionId: z.string(), typeKey: z.string().nullable(), saveToLibrary: z.boolean().default(false) }),
  /** Set or clear an X2 note on one symbol. Null clears the note and leaves the type. */
  z.object({ op: z.literal('set_note'), detectionId: z.string(), tagText: z.string().nullable() }),
  /** Save a legend key to the planner library. No detection is required (zero plan occurrences). */
  z.object({ op: z.literal('save_legend'), legendKey: z.string().min(1), typeKey: z.string().min(1) }),
  z.object({ op: z.literal('confirm'), detectionIds: z.array(z.string()).min(1) }),
  z.object({ op: z.literal('delete'), detectionId: z.string() }),
  z.object({ op: z.literal('restore'), detectionId: z.string() }),
  z.object({ op: z.literal('add'), tempId: z.string(), sheetKey: z.string(), x: z.number(), y: z.number(), typeKey: z.string().nullable() }),
  z.object({ op: z.literal('move'), detectionId: z.string(), x: z.number(), y: z.number() }),
  z.object({ op: z.literal('set_floor'), sheetKey: z.string(), floorLabel: z.string().nullable() }),
  z.object({ op: z.literal('set_scale'), sheetKey: z.string(), ratio: z.number().positive() }),
  z.object({ op: z.literal('upsert_area'), area: areaSchema }),
  z.object({ op: z.literal('delete_area'), areaId: z.string() }),
  z.object({
    op: z.literal('set_sheet_included'),
    fileId: z.string(),
    sheetKey: z.string(),
    included: z.boolean(),
  }),
  z.object({
    op: z.literal('pair_sheets'),
    pdfFileId: z.string(),
    pdfSheetKey: z.string(),
    dwgFileId: z.string(),
    dwgSheetKey: z.string(),
  }),
  z.object({
    op: z.literal('unpair_sheets'),
    pdfFileId: z.string(),
    pdfSheetKey: z.string(),
    dwgFileId: z.string(),
    dwgSheetKey: z.string(),
  }),
  /** Separate from per-item review: the user checked the plan for devices the engine missed. */
  z.object({ op: z.literal('confirm_plan_review'), confirmed: z.boolean() }),
]);
export type TakeoffEdit = z.infer<typeof takeoffEditSchema>;

/** Everything the review screen needs in one round trip. `revision` is the optimistic-concurrency token. */
export const analysisViewSchema = z.object({
  summary: analysisSummarySchema,
  files: z.array(fileDtoSchema),
  sheets: z.array(sheetDtoSchema),
  detections: z.array(effectiveDetectionSchema),
  areas: z.array(areaSchema),
  boq: boqSchema,
  catalog: z.array(catalogTypeSchema),
  ruleSet: measurementRuleSetSchema,
  lastJob: jobDtoSchema.nullable(),
  /** Warnings/errors from the latest successful job (`[]` when none). Includes persisted worker + sheet-derived rows. */
  workerWarnings: z.array(analysisWorkerWarningSchema).default([]),
  /** Same as `lastJob.stats` when present; convenience for limits/metrics panels. */
  workerStats: z.record(z.string(), z.number()).default({}),
  permissions: z.object({
    canRun: z.boolean(),
    canEdit: z.boolean(),
    canApprove: z.boolean(),
    canManageLibrary: z.boolean(),
    canReopen: z.boolean(),
    canPickFromProjectCloud: z.boolean(),
    canPurgeEphemeral: z.boolean(),
  }),
  /** Append-only edit log (when server sends it). Drives sheet inclusion / pairing UI. */
  appliedEdits: z.array(takeoffEditSchema).optional(),
  /** True only after an explicit plan-completeness confirmation that later quantity edits have not cleared. */
  planReviewConfirmed: z.boolean().optional(),
});
export type AnalysisView = z.infer<typeof analysisViewSchema>;

export type ExportKind = 'xlsx' | 'boq-pdf' | 'annotated-pdf';

/** What server actions expose. Server actions implement it (Agent 5); the UI consumes it (Agent 4). */
export interface TakeoffClientApi {
  listAnalyses(projectId: string, options?: { includeArchived?: boolean }): Promise<AnalysisSummary[]>;
  renameAnalysis(analysisId: string, name: string): Promise<void>;
  archiveAnalysis(analysisId: string): Promise<void>;
  restoreAnalysis(analysisId: string): Promise<void>;
  deleteAnalysis(analysisId: string): Promise<void>;
  createAnalysis(projectId: string, input: { name: string; plannerKey?: string }): Promise<AnalysisSummary>;
  /** Includes `workerWarnings` and `workerStats` from the latest successful job (default empty). */
  getAnalysisView(analysisId: string): Promise<AnalysisView>;
  /** Registers a file slot; bytes go through the chunk transport (see upload-transport). */
  getTakeoffInputCapabilities(projectId: string): Promise<{
    persistenceDefault: TakeoffPersistenceMode;
    canPickFromProjectCloud: boolean;
  }>;
  beginFileUpload(analysisId: string, input: { name: string; sizeBytes: number; kind: TakeoffSourceKind }): Promise<{ fileId: string; chunkBytes: number }>;
  linkCloudFile(
    analysisId: string,
    input: { providerFileId: string; fileName: string; mimeType: string; parentFolderId: string },
  ): Promise<{ fileId: string; kind: TakeoffSourceKind }>;
  purgeEphemeralTakeoff(analysisId: string): Promise<void>;
  startAnalysis(
    analysisId: string,
    input: {
      fileIds: string[];
      pairing?: { pdfFileId: string; dwgFileId: string }[];
      sheetKeys?: string[];
      sheetSelection?: { fileId: string; sheetKey: string }[];
      ruleSetId?: string;
      useAi?: boolean;
    },
  ): Promise<{ jobId: string }>;
  getJobProgress(jobId: string): Promise<TakeoffJobDto>;
  cancelJob(jobId: string): Promise<void>;
  /** Throws a typed conflict if `expectedRevision` is stale. Returns the fresh view. */
  applyEdits(analysisId: string, edits: TakeoffEdit[], expectedRevision: number): Promise<AnalysisView>;
  approveAnalysis(analysisId: string, expectedRevision: number): Promise<AnalysisView>;
  reopenAnalysis(analysisId: string, expectedRevision: number): Promise<AnalysisView>;
  listLibrary(plannerKey: string): Promise<SymbolLibraryEntry[]>;
  deleteLibraryEntry(entryId: string): Promise<void>;
  listRuleSets(projectId: string): Promise<MeasurementRuleSet[]>;
  saveRuleSet(projectId: string, ruleSet: MeasurementRuleSet): Promise<MeasurementRuleSet>;
  setAnalysisRuleSet(analysisId: string, ruleSetId: string, expectedRevision: number): Promise<AnalysisView>;
  listCatalog(): Promise<CatalogType[]>;
  saveCatalogType(type: CatalogType): Promise<CatalogType>;
  /** Returns a same-origin download URL (permission-checked route). */
  requestExport(analysisId: string, kind: ExportKind): Promise<{ url: string; fileName: string }>;
}

/** Typed domain errors the UI must handle (mapped by the server layer). */
export const TAKEOFF_ERROR_CODES = [
  'revision_conflict',
  'analysis_locked_approved',
  'file_type_unsupported',
  'file_too_large',
  'worker_unavailable',
  'job_failed',
  'forbidden',
  'not_found',
  'approval_blocked_review',
  'approval_blocked_plan_review',
] as const;
export type TakeoffErrorCode = (typeof TAKEOFF_ERROR_CODES)[number];
