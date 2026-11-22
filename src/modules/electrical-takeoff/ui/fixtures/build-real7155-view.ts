import type {
  AnalysisSummary,
  AnalysisView,
  MeasurementRuleSet,
  SheetDto,
  WorkerDetection,
  WorkerResult,
} from '../../domain/contracts';
import { workerResultSchema } from '../../domain/contracts';
import { applyEdits } from '../../domain/edits';
import { computeBoq } from '../../domain/boq-engine';
import { enrichDetectionsWithLegendIdentity } from '../../domain/legend-identity';
import { applyLegendZonePolicy } from '../../domain/legend-zone-policy';
import { loadDefaultCatalog } from '../../domain/catalog';
import { collectWorkerWarningsFromResult } from '../../domain/worker-warnings';

export const REAL7155_ANALYSIS_ID = 'real7155-light-g';
export const REAL7155_PRIMARY_SHEET = 'p1';
export const REAL7155_PREVIEW_LIGHTG = '/takeoff-fixtures/real7155/preview-lightg-p1.jpg';

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

function previewUrlForSheet(fileId: string, sheetKey: string): string | null {
  if (fileId === 'lightg' && sheetKey === 'p1') return REAL7155_PREVIEW_LIGHTG;
  if (fileId === 'legend' && sheetKey === 'p1') return '/takeoff-fixtures/real7155/preview-legend-p1.jpg';
  if (fileId === 'dwg' && sheetKey.startsWith('layout:')) {
    const slug = encodeURIComponent(sheetKey.replace(/^layout:/, ''));
    return `/takeoff-fixtures/real7155/dwg-${slug}.jpg`;
  }
  return null;
}

function twinIdMap(detections: readonly WorkerDetection[]): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const d of detections) m.set(d.id, d.twinId);
  return m;
}

/** Map ingested worker output to a full {@link AnalysisView} (domain applyEdits + computeBoq). */
export function buildAnalysisViewFromWorkerResult(
  result: WorkerResult,
  options?: { analysisId?: string; name?: string; projectId?: string },
): { view: AnalysisView; workerBase: WorkerDetection[] } {
  const catalog = loadDefaultCatalog();
  const workerBase = result.detections;
  const sheets: SheetDto[] = [...result.sheets]
    .sort((a, b) => {
      if (a.fileId === 'lightg') return -1;
      if (b.fileId === 'lightg') return 1;
      return 0;
    })
    .map((s) => ({
    sheetKey: s.sheetKey,
    fileId: s.fileId,
    name: s.name,
    kind: s.kind,
    index: s.index,
    widthPx: s.widthPx,
    heightPx: s.heightPx,
    previewUrl: previewUrlForSheet(s.fileId, s.sheetKey),
    floorLabel: s.floorHint ?? null,
    scale: s.scale,
    analyzed: s.analyzed,
    xrefsMissing: s.xrefsMissing ?? [],
    hiddenByLayers: s.hiddenByLayers ?? 0,
  }));
  const files = [
    { id: 'legend', name: '7155-A1-מקרא.pdf', kind: 'pdf' as const, sizeBytes: 1_900_000, uploadedAtIso: result.startedAtIso, sha256: null },
    { id: 'lightg', name: '7155-A1-תאורה ג.pdf', kind: 'pdf' as const, sizeBytes: 2_100_000, uploadedAtIso: result.startedAtIso, sha256: null },
    { id: 'dwg', name: '7155-A1.dwg', kind: 'dwg' as const, sizeBytes: 6_400_000, uploadedAtIso: result.startedAtIso, sha256: null },
  ];
  const detections = enrichDetectionsWithLegendIdentity(
    applyLegendZonePolicy(applyEdits(workerBase, [], {}), {
      legend: result.legend ?? [],
      sheets,
      files,
    }),
    result.legend ?? [],
    {
      classifiedByById: new Map(workerBase.map((row) => [row.id, row.classifiedBy])),
    },
  );

  const summary: AnalysisSummary = {
    id: options?.analysisId ?? REAL7155_ANALYSIS_ID,
    name: options?.name ?? '7155 תאורה ג (נתוני worker)',
    status: 'in_review',
    plannerKey: '7155_light_g',
    revision: 1,
    updatedAtIso: result.finishedAtIso,
    fileCount: new Set(result.sheets.map((s) => s.fileId)).size,
    approvedAtIso: null,
    persistenceMode: 'persistent',
  };

  const workerWarnings = collectWorkerWarningsFromResult(result);
  const twinIdByDetectionId = twinIdMap(workerBase);
  const boq = computeBoq({
    detections,
    workerDetections: workerBase,
    sheets,
    areas: [],
    catalog,
    ruleSet: DEFAULT_RULE_SET,
    linear: result.linear ?? [],
    state: 'draft',
    twinIdByDetectionId,
    detectionFileIdById: new Map(workerBase.map((d) => [d.id, d.fileId])),
    mergeMatchedPairs: result.stats?.['merge_matched_pairs'] ?? result.stats?.['merge_matched_pairs:lightg'],
  });

  const view: AnalysisView = {
    summary,
    files,
    sheets,
    detections,
    areas: [],
    catalog,
    ruleSet: DEFAULT_RULE_SET,
    lastJob: {
      id: result.jobId,
      status: result.status === 'failed' ? 'failed' : 'succeeded',
      stage: 'done',
      percent: 100,
      message: null,
      startedAtIso: result.startedAtIso,
      finishedAtIso: result.finishedAtIso,
      error: result.errors[0]?.message ?? null,
      stats: result.stats,
    },
    boq,
    workerWarnings,
    workerStats: result.stats,
    legend: result.legend ?? [],
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

const CLASSIFIED_BY = new Set([
  'library',
  'dwg_block_map',
  'legend_text',
  'ai',
  'shape_cluster',
  'none',
]);

/** Accept v1 corpus JSON until `corpus_run.py` is regenerated with contract v2. */
export function normalizeCorpusWorkerJson(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw as Record<string, unknown>;
  const stripNull = (v: unknown) => (v === null ? undefined : v);
  const detections = Array.isArray(body.detections)
    ? body.detections.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const d = row as Record<string, unknown>;
        const classifiedBy = CLASSIFIED_BY.has(String(d.classifiedBy)) ? d.classifiedBy : 'none';
        const rawClass = typeof d.rawClass === 'string' ? d.rawClass : '';
        const signature = typeof d.signature === 'string' ? d.signature : `legacy:${d.id ?? 'x'}`;
        const clean = { ...d, classifiedBy, rawClass, signature } as Record<string, unknown>;
        for (const key of Object.keys(clean)) {
          if (clean[key] === null && key !== 'typeKey') delete clean[key];
        }
        if (clean.typeKey === undefined) clean.typeKey = null;
        return clean;
      })
    : body.detections;
  const sheets = Array.isArray(body.sheets)
    ? body.sheets.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const s = row as Record<string, unknown>;
        const scale = s.scale && typeof s.scale === 'object' ? { ...(s.scale as object) } : s.scale;
        if (scale && typeof scale === 'object') {
          const sc = scale as Record<string, unknown>;
          sc.note = stripNull(sc.note);
        }
        return {
          ...s,
          note: stripNull(s.note),
          floorHint: stripNull(s.floorHint),
          scale,
        };
      })
    : body.sheets;
  return {
    ...body,
    contractVersion: 2,
    sheets,
    detections,
    legend: Array.isArray(body.legend) ? body.legend : [],
    linear: body.linear ?? [],
    warnings: Array.isArray(body.warnings)
      ? body.warnings.map((row) => {
          if (!row || typeof row !== 'object') return row;
          const w = row as Record<string, unknown>;
          return {
            ...w,
            fileId: stripNull(w.fileId),
            sheetKey: stripNull(w.sheetKey),
          };
        })
      : [],
    errors: body.errors ?? [],
    stats: body.stats ?? {},
    engineVersions: body.engineVersions ?? {},
  };
}

export function parseWorkerResultJson(raw: unknown): WorkerResult {
  return workerResultSchema.parse(normalizeCorpusWorkerJson(raw));
}