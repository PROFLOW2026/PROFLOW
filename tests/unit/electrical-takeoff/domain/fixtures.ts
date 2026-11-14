import type { EffectiveDetection, MeasurementRuleSet, SheetDto, TakeoffArea, WorkerDetection, WorkerLinear } from '@/modules/electrical-takeoff/domain/contracts';

export function workerDet(overrides: Partial<WorkerDetection> & Pick<WorkerDetection, 'id' | 'sheetKey'>): WorkerDetection {
  return {
    fileId: 'f1',
    source: 'pdf',
    x: 100,
    y: 100,
    w: 8,
    h: 8,
    signature: 'shape:abc',
    signatureKind: 'pdf-shape',
    rawClass: 'L1',
    typeKey: 'power.socket.single',
    classifiedBy: 'legend_text',
    confidence: 'medium',
    reasons: [],
    maskB64: undefined,
    ...overrides,
  };
}

export function sheetDto(overrides: Partial<SheetDto> & Pick<SheetDto, 'sheetKey'>): SheetDto {
  return {
    fileId: 'f1',
    name: 'קומה 1',
    kind: 'pdf_page',
    index: 0,
    widthPx: 1000,
    heightPx: 1000,
    previewUrl: null,
    scale: { ratio: 100, metersPerPreviewPx: 0.01, verified: true, source: 'title_text' },
    analyzed: 'full',
    xrefsMissing: [],
    hiddenByLayers: 0,
    floorLabel: 'קומה 1',
    floorHint: 'קומה 1',
    ...overrides,
  };
}

export const testArea: TakeoffArea = {
  id: 'area-a',
  sheetKey: 'p1',
  name: 'לובי',
  polygon: [
    [0, 0],
    [500, 0],
    [500, 500],
    [0, 500],
  ],
};

export const proximityRuleSet: MeasurementRuleSet = {
  id: 'test-proximity',
  name: 'test',
  scope: 'project',
  version: 1,
  rules: [
    {
      id: 'group-sockets',
      label: 'group',
      appliesTo: { typeKeys: ['power.socket.single'] },
      mode: 'group_by_proximity',
      proximity: { radiusPx: 30 },
      output: { lineKind: 'point_count' },
    },
    {
      id: 'count-each',
      label: 'each',
      appliesTo: {},
      mode: 'count_each',
      output: { lineKind: 'device_count' },
    },
  ],
};

export function linearRun(verified: boolean): WorkerLinear {
  return {
    id: 'lin-1',
    sheetKey: 'p1',
    fileId: 'f1',
    typeKey: 'linear.conduit',
    points: [
      [0, 0],
      [100, 0],
    ],
    lengthMeters: verified ? 12.5 : null,
    lengthPreviewPx: 100,
    scaleVerified: verified,
  };
}

export function effFromWorker(d: WorkerDetection, extra?: Partial<EffectiveDetection>): EffectiveDetection {
  return {
    id: d.id,
    sheetKey: d.sheetKey,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    typeKey: d.typeKey,
    origin: 'auto',
    status: 'suggested',
    confidence: d.confidence,
    reasons: d.reasons,
    rawClass: d.rawClass,
    tagText: d.tagText ?? null,
    source: d.source,
    areaId: null,
    needsReview: d.typeKey === null || d.confidence === 'low',
    ...extra,
  };
}