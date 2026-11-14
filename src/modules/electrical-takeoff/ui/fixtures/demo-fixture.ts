import type {
  AnalysisSummary,
  AnalysisView,
  CatalogType,
  EffectiveDetection,
  MeasurementRuleSet,
  SheetDto,
} from '../../domain/contracts';

const PREVIEW_URL = '/takeoff-fixtures/preview-light-g.png';
const SHEET_W = 900;
const SHEET_H = 540;
const SHEET_KEY = 'p1';

const DEMO_CATALOG: CatalogType[] = [
  {
    key: 'light.recessed',
    category: 'lighting',
    role: 'fixture',
    nameHe: 'גוף שקוע',
    nameEn: 'Recessed',
    unit: "יח'",
    keywordsHe: ['שקוע'],
    colorHex: '#f59e0b',
    builtIn: true,
    archived: false,
  },
  {
    key: 'light.surface',
    category: 'lighting',
    role: 'fixture',
    nameHe: 'גוף צמוד תקרה',
    unit: "יח'",
    keywordsHe: ['צמוד'],
    colorHex: '#eab308',
    builtIn: true,
    archived: false,
  },
  {
    key: 'power.socket.single',
    category: 'power',
    role: 'device',
    nameHe: 'שקע יחיד',
    unit: "יח'",
    keywordsHe: ['שקע'],
    colorHex: '#3b82f6',
    builtIn: true,
    archived: false,
  },
  {
    key: 'control.switch',
    category: 'control',
    role: 'device',
    nameHe: 'מפסק',
    unit: "יח'",
    keywordsHe: ['מפסק'],
    colorHex: '#8b5cf6',
    builtIn: true,
    archived: false,
  },
  {
    key: 'fire.smoke',
    category: 'fire_detection',
    role: 'device',
    nameHe: 'גלאי עשן',
    unit: "יח'",
    keywordsHe: ['עשן'],
    colorHex: '#ef4444',
    builtIn: true,
    archived: false,
  },
];

const TYPE_KEYS = DEMO_CATALOG.map((c) => c.key);

function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildDemoDetections(count = 220): EffectiveDetection[] {
  const out: EffectiveDetection[] = [];
  for (let i = 0; i < count; i += 1) {
    const typeKey = i % 17 === 0 ? null : TYPE_KEYS[i % TYPE_KEYS.length]!;
    const confidence = typeKey
      ? i % 11 === 0
        ? 'medium'
        : i % 23 === 0
          ? 'low'
          : 'high'
      : 'none';
    const reasons =
      typeKey == null
        ? (['unclassified'] as const)
        : confidence === 'low'
          ? (['low_confidence'] as const)
          : confidence === 'medium' && i % 5 === 0
            ? (['type_ambiguous'] as const)
            : ([] as const);
    out.push({
      id: `${SHEET_KEY}#${i + 1}`,
      sheetKey: SHEET_KEY,
      x: 40 + seeded(i) * (SHEET_W - 80),
      y: 40 + seeded(i + 1000) * (SHEET_H - 80),
      w: 14 + (i % 3) * 2,
      h: 14 + (i % 2) * 2,
      typeKey,
      origin: 'auto',
      status: confidence === 'high' ? 'suggested' : 'suggested',
      confidence,
      reasons: [...reasons],
      rawClass: `L${(i % 12) + 1}`,
      tagText: i % 9 === 0 ? `T${20 + (i % 4)}` : null,
      source: i % 3 === 0 ? 'merged' : i % 2 === 0 ? 'pdf' : 'dwg',
      areaId: null,
      needsReview: reasons.length > 0 || typeKey == null,
    });
  }
  return out;
}

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

export const DEMO_ANALYSIS_ID = 'demo-7155-light-g';
export const DEMO_PROJECT_ID = 'demo-project';

export function buildDemoAnalysisView(detections: EffectiveDetection[] = buildDemoDetections()): AnalysisView {
  const sheet: SheetDto = {
    sheetKey: SHEET_KEY,
    fileId: 'file-demo-pdf',
    name: '7155 תאורה ג',
    kind: 'pdf_page',
    index: 0,
    widthPx: SHEET_W,
    heightPx: SHEET_H,
    previewUrl: PREVIEW_URL,
    floorLabel: 'קומה 1',
    scale: {
      ratio: 100,
      metersPerPreviewPx: null,
      verified: false,
      source: 'title_text',
      note: 'לא אומתה ידנית',
    },
    analyzed: 'full',
    xrefsMissing: [{ name: 'elec_xref.dwg' }],
    hiddenByLayers: 0,
  };
  const summary: AnalysisSummary = {
    id: DEMO_ANALYSIS_ID,
    name: 'ניתוח 7155 תאורה ג (דמו)',
    status: 'in_review',
    plannerKey: 'planner-demo',
    revision: 3,
    updatedAtIso: new Date().toISOString(),
    fileCount: 2,
    approvedAtIso: null,
    persistenceMode: 'persistent',
  };
  const unclassifiedCount = detections.filter((d) => !d.typeKey).length;
  const needsReviewCount = detections.filter((d) => d.needsReview).length;
  return {
    summary,
    files: [
      {
        id: 'file-demo-pdf',
        name: '7155_light_g.pdf',
        kind: 'pdf',
        sizeBytes: 4_200_000,
        uploadedAtIso: new Date().toISOString(),
        sha256: null,
      },
      {
        id: 'file-demo-dwg',
        name: '7155_light_g.dwg',
        kind: 'dwg',
        sizeBytes: 8_100_000,
        uploadedAtIso: new Date().toISOString(),
        sha256: null,
      },
    ],
    sheets: [sheet],
    detections,
    areas: [],
    catalog: DEMO_CATALOG,
    ruleSet: DEFAULT_RULE_SET,
    lastJob: {
      id: 'job-demo',
      status: 'succeeded',
      stage: 'done',
      percent: 100,
      message: null,
      startedAtIso: new Date().toISOString(),
      finishedAtIso: new Date().toISOString(),
      error: null,
    },
    boq: {
      lines: [],
      unclassifiedCount,
      needsReviewCount,
      completeness: {
        sheetsTotal: 1,
        sheetsFullyAnalyzed: 1,
        partialSheets: [],
        skippedSheets: [],
        xrefsMissing: ['elec_xref.dwg'],
        scaleUnverifiedSheets: [SHEET_KEY],
      },
      warnings: ['קנה מידה לא מאומת', 'קובץ xref חסר'],
      state: 'draft',
    },
    workerWarnings: [
      {
        code: 'xref_missing',
        severity: 'warning',
        message: 'Missing xref: elec_xref.dwg',
        sheetKey: SHEET_KEY,
        fileId: 'file-demo-pdf',
      },
      {
        code: 'sheet_partial',
        severity: 'warning',
        message: 'חלק מהגיליון לא נותח',
        sheetKey: SHEET_KEY,
        fileId: 'file-demo-pdf',
      },
    ],
    workerStats: { classified_count: 0.42, detection_count: detections.length },
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
}

export function buildEmptyAnalysisSummary(name: string): AnalysisSummary {
  return {
    id: `analysis-${Date.now()}`,
    name,
    status: 'draft',
    plannerKey: 'unknown',
    revision: 0,
    updatedAtIso: new Date().toISOString(),
    fileCount: 0,
    approvedAtIso: null,
    persistenceMode: 'persistent',
  };
}