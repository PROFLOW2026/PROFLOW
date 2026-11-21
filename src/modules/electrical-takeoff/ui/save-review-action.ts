import type { EffectiveDetection, TakeoffEdit } from '../domain/contracts';
import { canSaveReviewIdentity } from '../domain/review-copy';
import { reviewKind } from './review-guide';
import { sameSymbolDetections } from './symbol-group';
import { buildGroupReclassifyEdits, legendConflictOnDetection } from './takeoff-analysis-view';

export type SaveReviewPlan = {
  ids: string[];
  requestedCount: number;
  includedCount: number;
  skippedCount: number;
  skippedConflict: number;
  skippedUncertain: number;
  typeKey: string | null;
  confirm: boolean;
  saveToLibrary: boolean;
};

/**
 * Group save never spills onto a conflicting or uncertain mark just because it
 * shares a block/signature. The selected mark is always included.
 */
export function resolveSaveReviewPlan(input: {
  selected: EffectiveDetection;
  detections: readonly EffectiveDetection[];
  applyToGroup: boolean;
  typeKey: string | null;
  confirm: boolean;
  saveToLibrary: boolean;
  candidateIds?: readonly string[];
}): SaveReviewPlan {
  const conflictSelected = legendConflictOnDetection(input.selected);
  const useGroup = input.applyToGroup && !conflictSelected;
  const pool = input.candidateIds?.length
    ? input.detections.filter((item) => input.candidateIds!.includes(item.id))
    : useGroup
      ? sameSymbolDetections(input.selected, input.detections)
      : [input.selected];
  const ids: string[] = [];
  let skippedConflict = 0;
  let skippedUncertain = 0;
  for (const item of pool) {
    if (item.id === input.selected.id) {
      ids.push(item.id);
      continue;
    }
    if (input.confirm) {
      if (legendConflictOnDetection(item)) {
        skippedConflict += 1;
        continue;
      }
      if (reviewKind(item) === 'uncertain') {
        skippedUncertain += 1;
        continue;
      }
      if (input.typeKey && item.typeKey && item.typeKey !== input.typeKey) {
        skippedConflict += 1;
        continue;
      }
      if (!input.typeKey && !canSaveReviewIdentity(null, item)) {
        skippedUncertain += 1;
        continue;
      }
    }
    ids.push(item.id);
  }
  return {
    ids,
    requestedCount: pool.length,
    includedCount: ids.length,
    skippedCount: skippedConflict + skippedUncertain,
    skippedConflict,
    skippedUncertain,
    typeKey: input.typeKey,
    confirm: input.confirm,
    saveToLibrary: input.saveToLibrary,
  };
}

export function buildSaveReviewEdits(
  plan: SaveReviewPlan,
  detections: readonly EffectiveDetection[],
): TakeoffEdit[] {
  const byId = new Map(detections.map((item) => [item.id, item]));
  const edits: TakeoffEdit[] = [];
  if (plan.typeKey) {
    const typeIds = plan.ids.filter((id) => {
      const row = byId.get(id);
      return Boolean(plan.saveToLibrary) || row?.typeKey !== plan.typeKey;
    });
    if (typeIds.length > 0) {
      edits.push(...buildGroupReclassifyEdits(typeIds, detections, plan.typeKey, plan.saveToLibrary));
    }
  }
  if (plan.confirm && plan.ids.length > 0) {
    edits.push({ op: 'confirm', detectionIds: [...plan.ids] });
  }
  return edits;
}

export function nextUnconfirmedId(
  currentId: string,
  ids: readonly string[],
  detections: readonly EffectiveDetection[],
): string | null {
  const byId = new Map(detections.map((item) => [item.id, item]));
  const start = Math.max(0, ids.indexOf(currentId));
  for (let i = 1; i < ids.length; i += 1) {
    const id = ids[(start + i) % ids.length];
    if (!id || id === currentId) continue;
    if (byId.get(id)?.status !== 'confirmed') return id;
  }
  return null;
}
