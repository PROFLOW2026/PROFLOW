import { applyEdits, type ApplyEditsContext } from '../domain/edits';
import { computeBoq, type ComputeBoqInput } from '../domain/boq-engine';
import { resolveSheetInclusion } from '../domain/sheet-selection';
import { planReviewConfirmed } from '../domain/plan-review';
import type {
  AnalysisView,
  EffectiveDetection,
  TakeoffArea,
  TakeoffEdit,
  WorkerDetection,
} from '../domain/contracts';

/** Demo / optimistic path: rebuild effective detections + BOQ using domain pure functions. */
export function effectiveToWorker(d: EffectiveDetection, fileId = 'demo-file'): WorkerDetection {
  const source = d.source === 'merged' ? 'pdf' : d.source === 'manual' ? 'pdf' : d.source;
  return {
    id: d.id,
    sheetKey: d.sheetKey,
    fileId,
    source,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    signature: `ui:${d.id}`,
    signatureKind: 'pdf-shape',
    rawClass: d.rawClass,
    typeKey: d.typeKey,
    classifiedBy: 'none',
    confidence: d.confidence,
    reasons: [...d.reasons],
    tagText: d.tagText ?? undefined,
  };
}

export function rebuildViewFromEdits(input: {
  view: AnalysisView;
  workerBase: readonly WorkerDetection[];
  edits: readonly TakeoffEdit[];
}): AnalysisView {
  const ctx: ApplyEditsContext = {
    areas: input.view.areas,
    floorBySheet: buildFloorMap(input.view),
  };
  const detections = applyEdits(input.workerBase, input.edits, ctx);
  let areas: TakeoffArea[] = [...input.view.areas];
  for (const edit of input.edits) {
    if (edit.op === 'upsert_area') {
      areas = areas.filter((a) => a.id !== edit.area.id).concat(edit.area);
    }
    if (edit.op === 'delete_area') {
      areas = areas.filter((a) => a.id !== edit.areaId);
    }
  }
  const sheets = input.view.sheets.map((s) => {
    for (const edit of input.edits) {
      if (edit.op === 'set_floor' && edit.sheetKey === s.sheetKey) {
        return { ...s, floorLabel: edit.floorLabel };
      }
      if (edit.op === 'set_scale' && edit.sheetKey === s.sheetKey) {
        return {
          ...s,
          scale: { ...s.scale, ratio: edit.ratio, verified: false, source: 'user' as const },
        };
      }
    }
    return s;
  });
  const twinIdByDetectionId = new Map<string, string | undefined>();
  const detectionFileIdById = new Map<string, string>();
  for (const d of input.workerBase) {
    twinIdByDetectionId.set(d.id, d.twinId);
    detectionFileIdById.set(d.id, d.fileId);
  }

  const inclusion = resolveSheetInclusion(sheets, input.view.files, input.edits);
  const includedSheetRefIds = new Set(
    [...inclusion.entries()].filter(([, on]) => on).map(([ref]) => ref),
  );

  const boqInput: ComputeBoqInput = {
    detections,
    workerDetections: input.workerBase,
    sheets,
    areas,
    catalog: input.view.catalog,
    ruleSet: input.view.ruleSet,
    linear: [],
    state: input.view.summary.status === 'approved' ? 'approved' : 'draft',
    floorBySheet: buildFloorMap({ ...input.view, sheets }),
    twinIdByDetectionId,
    includedSheetRefIds,
    detectionFileIdById,
  };
  const boq = computeBoq(boqInput);
  return {
    ...input.view,
    sheets,
    areas,
    detections,
    boq,
    appliedEdits: [...input.edits],
    planReviewConfirmed: planReviewConfirmed(input.edits),
  };
}

function buildFloorMap(view: AnalysisView): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const s of view.sheets) {
    m.set(s.sheetKey, s.floorLabel);
  }
  return m;
}