import type {
  AnalysisSummary,
  AnalysisView,
  MeasurementRuleSet,
  SheetDto,
  TakeoffConfidence,
  TakeoffReviewReason,
  WorkerDetection,
} from '../../domain/contracts';
import { confidenceSchema, reviewReasonSchema } from '../../domain/contracts';
import { applyEdits } from '../../domain/edits';
import { computeBoq } from '../../domain/boq-engine';
import { loadDefaultCatalog } from '../../domain/catalog';
import pinsPlan from './pins-plan.json';

export const PINS_ANALYSIS_ID = 'pins-floors-3-4';
export const PINS_FILE_ID = 'pins-pdf';
export const PINS_SHEET_KEY = 'p1';
/** Same raster the proof engine used: long edge 2400, page view 3370×2384 pt. */
export const PINS_PREVIEW_WIDTH = 2400;
export const PINS_PREVIEW_HEIGHT = 1698;
export const PINS_PREVIEW_URL = '/takeoff-fixtures/pins/preview-p1.jpg';

export type PinsPlanMark = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  legendKey: string | null;
  typeKey: string | null;
  conf: string;
  reasons: string[];
  tag?: string | null;
};

const DEFAULT_RULE_SET: MeasurementRuleSet = {
  id: 'default',
  name: 'ספירת כל זיהוי פעם אחת',
  scope: 'default',
  version: 1,
  rules: [
    {
      id: 'count-all',
      label: 'ספירת כל זיהוי',
      appliesTo: {},
      mode: 'count_each',
      output: { lineKind: 'device_count', label: 'ספירה' },
    },
  ],
};

function asConfidence(value: string): TakeoffConfidence {
  const parsed = confidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : 'none';
}

function asReasons(values: readonly string[]): TakeoffReviewReason[] {
  return values.flatMap((value) => {
    const parsed = reviewReasonSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Proof-run plan rows are already in preview pixels (origin top-left) on the
 * 2400×1698 page raster. Pass them through. Do not scale, flip, or nudge.
 */
export function pinsMarkToWorkerDetection(mark: PinsPlanMark): WorkerDetection {
  return {
    id: mark.id,
    sheetKey: PINS_SHEET_KEY,
    fileId: PINS_FILE_ID,
    source: 'pdf',
    x: mark.x,
    y: mark.y,
    w: mark.w,
    h: mark.h,
    signature: `pins:${mark.id}`,
    signatureKind: 'pdf-shape',
    rawClass: mark.legendKey ?? '',
    ...(mark.legendKey ? { legendKey: mark.legendKey } : {}),
    typeKey: mark.typeKey,
    classifiedBy: mark.typeKey ? 'legend_text' : 'none',
    confidence: asConfidence(mark.conf),
    reasons: asReasons(mark.reasons),
    ...(mark.tag ? { tagText: mark.tag } : {}),
  };
}

export function pinsPlanMarks(): PinsPlanMark[] {
  return pinsPlan as PinsPlanMark[];
}

/** Map the Pins proof sheet onto the shared analysis view without moving marks. */
export function buildPinsAnalysisView(): { view: AnalysisView; workerBase: WorkerDetection[] } {
  const catalog = loadDefaultCatalog();
  const workerBase = pinsPlanMarks().map(pinsMarkToWorkerDetection);
  const detections = applyEdits(workerBase, [], {});
  const sheet: SheetDto = {
    sheetKey: PINS_SHEET_KEY,
    fileId: PINS_FILE_ID,
    name: 'חשמל קומות 3-4',
    kind: 'pdf_page',
    index: 0,
    widthPx: PINS_PREVIEW_WIDTH,
    heightPx: PINS_PREVIEW_HEIGHT,
    previewUrl: PINS_PREVIEW_URL,
    floorLabel: 'קומות 3-4',
    scale: {
      ratio: null,
      metersPerPreviewPx: null,
      verified: false,
      source: 'none',
    },
    analyzed: 'full',
    xrefsMissing: [],
    hiddenByLayers: 0,
  };

  const summary: AnalysisSummary = {
    id: PINS_ANALYSIS_ID,
    name: 'פינס — חשמל קומות 3-4',
    status: 'in_review',
    plannerKey: 'pins-floors-3-4',
    revision: 1,
    updatedAtIso: '2026-11-15T12:00:00.000Z',
    fileCount: 1,
    approvedAtIso: null,
    persistenceMode: 'persistent',
  };

  const boq = computeBoq({
    detections,
    workerDetections: workerBase,
    sheets: [sheet],
    areas: [],
    catalog,
    ruleSet: DEFAULT_RULE_SET,
    linear: [],
    state: 'draft',
    twinIdByDetectionId: new Map(workerBase.map((d) => [d.id, undefined])),
    detectionFileIdById: new Map(workerBase.map((d) => [d.id, d.fileId])),
  });

  const view: AnalysisView = {
    summary,
    files: [
      {
        id: PINS_FILE_ID,
        name: 'חשמל קומות 3-4.pdf',
        kind: 'pdf',
        sizeBytes: 1,
        uploadedAtIso: summary.updatedAtIso,
        sha256: null,
      },
    ],
    sheets: [sheet],
    detections,
    areas: [],
    catalog,
    ruleSet: DEFAULT_RULE_SET,
    lastJob: {
      id: 'pins-proof',
      status: 'succeeded',
      stage: 'done',
      percent: 100,
      message: null,
      startedAtIso: summary.updatedAtIso,
      finishedAtIso: summary.updatedAtIso,
      error: null,
      stats: { plan_n: workerBase.length },
    },
    boq,
    workerWarnings: [],
    workerStats: { plan_n: workerBase.length },
    legend: [],
    permissions: {
      canRun: true,
      canEdit: true,
      canApprove: true,
      canManageLibrary: true,
      canReopen: true,
      canPickFromProjectCloud: true,
      canPurgeEphemeral: false,
    },
  };

  return { view, workerBase };
}
