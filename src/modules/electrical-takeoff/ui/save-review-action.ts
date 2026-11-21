import type { EffectiveDetection, TakeoffEdit, TakeoffReviewReason } from '../domain/contracts';
import { canSaveReviewIdentity } from '../domain/review-copy';
import { sameSymbolDetections } from './symbol-group';
import {
  buildGroupReclassifyEdits,
  hasRealLegendConflict,
  sameConfirmIdentity,
} from './takeoff-analysis-view';

export type SaveReviewPlan = {
  ids: string[];
  requestedCount: number;
  includedCount: number;
  skippedCount: number;
  skippedConflict: number;
  skippedUncertain: number;
  inseparableConflict: boolean;
  typeKey: string | null;
  confirm: boolean;
  saveToLibrary: boolean;
};

/** Geometry / overlay doubts that must not ride along with a group confirm. */
const HARD_UNCERTAIN_REASONS = new Set<TakeoffReviewReason>([
  'possible_duplicate',
  'pdf_dwg_mismatch',
  'pdf_only',
  'dwg_only',
  'xref_missing',
  'dynamic_block_unresolved',
  'tag_unread',
  'overlapping_symbols_peeled',
  'possible_exploded_symbol',
]);

function hasHardUncertainty(item: EffectiveDetection): boolean {
  return item.reasons.some((reason) => HARD_UNCERTAIN_REASONS.has(reason));
}

/**
 * Group save never spills onto a conflicting or uncertain mark just because it
 * shares a block/signature. The selected mark is always included.
 * Catalog-family `type_ambiguous` on an identical legend identity can be confirmed together.
 */
export function resolveSaveReviewPlan(input: {
  selected: EffectiveDetection;
  detections: readonly EffectiveDetection[];
  applyToGroup: boolean;
  typeKey: string | null;
  confirm: boolean;
  saveToLibrary: boolean;
  candidateIds?: readonly string[];
  sheetOnly?: boolean;
  explicitGroupConfirm?: boolean;
}): SaveReviewPlan {
  const explicit = Boolean(input.explicitGroupConfirm);
  const useGroup = input.applyToGroup;
  let pool = input.candidateIds?.length
    ? input.detections.filter((item) => input.candidateIds!.includes(item.id))
    : useGroup
      ? sameSymbolDetections(input.selected, input.detections)
      : [input.selected];
  if (!useGroup) {
    pool = pool.filter((item) => item.id === input.selected.id);
  } else if (input.sheetOnly) {
    pool = pool.filter((item) => item.id === input.selected.id || item.sheetKey === input.selected.sheetKey);
  }

  const ids: string[] = [];
  let skippedConflict = 0;
  let skippedUncertain = 0;
  for (const item of pool) {
    if (item.id === input.selected.id) {
      ids.push(item.id);
      continue;
    }
    if (item.status === 'confirmed') {
      continue;
    }
    if (!sameConfirmIdentity(input.selected, item)) {
      skippedConflict += 1;
      continue;
    }
    if (hasRealLegendConflict(item) && !explicit) {
      skippedConflict += 1;
      continue;
    }
    if (input.confirm && !explicit && hasHardUncertainty(item)) {
      skippedUncertain += 1;
      continue;
    }
    if (input.confirm && input.typeKey && item.typeKey && item.typeKey !== input.typeKey) {
      skippedConflict += 1;
      continue;
    }
    if (input.confirm && !explicit && !input.typeKey && !canSaveReviewIdentity(null, item)) {
      skippedUncertain += 1;
      continue;
    }
    ids.push(item.id);
  }

  const mates = pool.filter((item) => item.id !== input.selected.id);
  const inseparableConflict =
    hasRealLegendConflict(input.selected) &&
    mates.length > 0 &&
    mates.every((item) => hasRealLegendConflict(item) && sameConfirmIdentity(input.selected, item)) &&
    !explicit &&
    ids.length === 1;

  return {
    ids,
    requestedCount: pool.length,
    includedCount: ids.length,
    skippedCount: skippedConflict + skippedUncertain,
    skippedConflict,
    skippedUncertain,
    inseparableConflict,
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
