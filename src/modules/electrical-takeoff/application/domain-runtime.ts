/**
 * Bridge to Agent 3 pure domain modules.
 */
import type { Boq, CatalogType, EffectiveDetection, MeasurementRuleSet, TakeoffEdit, WorkerDetection } from '../domain/contracts';
import { applyEdits } from '../domain/edits';
import { computeBoq } from '../domain/boq-engine';
import { loadDefaultCatalog as readDefaultCatalog } from '../domain/catalog';

export function applyEditsWithOrphans(
  base: readonly WorkerDetection[],
  edits: readonly TakeoffEdit[],
): { detections: EffectiveDetection[]; orphanEdits: TakeoffEdit[] } {
  return { detections: applyEdits(base, edits), orphanEdits: [] };
}

export async function loadApplyEdits(): Promise<typeof applyEditsWithOrphans> {
  return applyEditsWithOrphans;
}

export async function loadComputeBoq(): Promise<
  (detections: EffectiveDetection[], ruleSet: MeasurementRuleSet, approved: boolean) => Boq
> {
  return (detections, ruleSet, approved) =>
    computeBoq({
      detections,
      sheets: [],
      areas: [],
      catalog: readDefaultCatalog(),
      ruleSet,
      linear: [],
      state: approved ? 'approved' : 'draft',
    });
}

export async function loadDefaultCatalog(): Promise<readonly CatalogType[]> {
  return readDefaultCatalog();
}