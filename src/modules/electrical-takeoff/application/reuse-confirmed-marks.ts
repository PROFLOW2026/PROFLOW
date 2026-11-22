import type { DbExecutor } from '@/shared/db/types';
import type { TakeoffEdit } from '../domain/contracts';
import {
  buildReusedConfirmEdit,
  confirmedDetectionIds,
  planConfirmReuse,
  summarizeConfirmReuseSkips,
} from '../domain/confirm-reuse';
import {
  appendEdits,
  bumpAnalysisRevision,
  editsFromRows,
  findAnalysis,
  latestSuccessfulJob,
  listDetectionsForJob,
  listEdits,
  listLegendEntriesForJob,
  listPriorSameSourceAnalysisIds,
  nextEditSeq,
} from '../data/takeoff.repository';

export type ConfirmReuseApplyResult = {
  readonly transferred: number;
  readonly skipped: number;
  readonly sourceAnalysisIds: string[];
};

async function loadAnalysisTakeoffState(db: DbExecutor, organizationId: string, analysisId: string) {
  const job = await latestSuccessfulJob(db, organizationId, analysisId);
  const edits = editsFromRows(await listEdits(db, organizationId, analysisId));
  if (!job) return { detections: [], legend: [], edits };
  return {
    detections: await listDetectionsForJob(db, organizationId, job.id),
    legend: await listLegendEntriesForJob(db, organizationId, job.id),
    edits,
  };
}

export async function planConfirmReuseFromPriorAnalyses(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  targetAnalysisId: string,
  sourceAnalysisIds?: readonly string[],
): Promise<{ sourceAnalysisId: string; transferIds: string[]; skipped: number }[]> {
  const target = await loadAnalysisTakeoffState(db, organizationId, targetAnalysisId);
  const priors =
    sourceAnalysisIds && sourceAnalysisIds.length > 0
      ? [...sourceAnalysisIds]
      : await listPriorSameSourceAnalysisIds(db, organizationId, projectId, targetAnalysisId);
  const already = new Set(confirmedDetectionIds(target.edits));
  const plans: { sourceAnalysisId: string; transferIds: string[]; skipped: number }[] = [];
  for (const sourceAnalysisId of priors) {
    if (sourceAnalysisId === targetAnalysisId) continue;
    const source = await loadAnalysisTakeoffState(db, organizationId, sourceAnalysisId);
    const plan = planConfirmReuse({
      sourceDetections: source.detections,
      sourceEdits: source.edits,
      sourceLegend: source.legend,
      targetDetections: target.detections,
      targetEdits: target.edits,
      targetLegend: target.legend,
      extraConfirmedIds: [...already],
    });
    for (const id of plan.transferIds) already.add(id);
    plans.push({
      sourceAnalysisId,
      transferIds: plan.transferIds,
      skipped: plan.skipped.length,
    });
  }
  return plans;
}

export async function applyConfirmReusePlans(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  targetAnalysisId: string,
  plans: readonly { sourceAnalysisId: string; transferIds: string[] }[],
  actorUserId?: string | null,
): Promise<ConfirmReuseApplyResult> {
  const edits: TakeoffEdit[] = [];
  for (const plan of plans) {
    const edit = buildReusedConfirmEdit(plan.transferIds, plan.sourceAnalysisId);
    if (edit) edits.push(edit);
  }
  if (edits.length === 0) {
    return { transferred: 0, skipped: 0, sourceAnalysisIds: [] };
  }
  const analysis = await findAnalysis(db, organizationId, targetAnalysisId);
  if (!analysis) return { transferred: 0, skipped: 0, sourceAnalysisIds: [] };
  const bumped = await bumpAnalysisRevision(db, organizationId, targetAnalysisId, analysis.revision);
  if (bumped === null) return { transferred: 0, skipped: 0, sourceAnalysisIds: [] };
  let seq = await nextEditSeq(db, targetAnalysisId);
  await appendEdits(
    db,
    edits.map((op) => ({
      organizationId,
      projectId,
      analysisId: targetAnalysisId,
      seq: seq++,
      actorUserId: actorUserId ?? null,
      actorType: 'internal' as const,
      op: op as unknown as Record<string, unknown>,
    })),
  );
  return {
    transferred: edits.reduce((sum, edit) => sum + (edit.op === 'confirm' ? edit.detectionIds.length : 0), 0),
    skipped: 0,
    sourceAnalysisIds: plans.map((plan) => plan.sourceAnalysisId),
  };
}

/** After a worker ingest: copy proven confirms from older analyses of the same source file. Idempotent. */
export async function reuseConfirmedMarksFromPriorAnalyses(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  targetAnalysisId: string,
): Promise<ConfirmReuseApplyResult> {
  const plans = await planConfirmReuseFromPriorAnalyses(db, organizationId, projectId, targetAnalysisId);
  const transferable = plans.filter((plan) => plan.transferIds.length > 0);
  if (transferable.length === 0) {
    return {
      transferred: 0,
      skipped: plans.reduce((sum, plan) => sum + plan.skipped, 0),
      sourceAnalysisIds: [],
    };
  }
  const applied = await applyConfirmReusePlans(db, organizationId, projectId, targetAnalysisId, transferable);
  return {
    ...applied,
    skipped: plans.reduce((sum, plan) => sum + plan.skipped, 0),
  };
}

export async function planConfirmReuseBetweenAnalyses(
  db: DbExecutor,
  organizationId: string,
  sourceAnalysisId: string,
  targetAnalysisId: string,
): Promise<{ transferIds: string[]; skipped: number; skippedReasons: Record<string, number> }> {
  const target = await loadAnalysisTakeoffState(db, organizationId, targetAnalysisId);
  const source = await loadAnalysisTakeoffState(db, organizationId, sourceAnalysisId);
  const plan = planConfirmReuse({
    sourceDetections: source.detections,
    sourceEdits: source.edits,
    sourceLegend: source.legend,
    targetDetections: target.detections,
    targetEdits: target.edits,
    targetLegend: target.legend,
  });
  return {
    transferIds: plan.transferIds,
    skipped: plan.skipped.length,
    skippedReasons: summarizeConfirmReuseSkips(plan.skipped),
  };
}

/** One-time restore. Call only after Owner approval to write. Idempotent; never copies delete/reclassify. */
export async function transferConfirmedMarksFromAnalysis(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  sourceAnalysisId: string,
  targetAnalysisId: string,
  actorUserId?: string | null,
): Promise<ConfirmReuseApplyResult & { skippedReasons: Record<string, number> }> {
  const plan = await planConfirmReuseBetweenAnalyses(db, organizationId, sourceAnalysisId, targetAnalysisId);
  const applied = await applyConfirmReusePlans(
    db,
    organizationId,
    projectId,
    targetAnalysisId,
    [{ sourceAnalysisId, transferIds: plan.transferIds }],
    actorUserId,
  );
  return { ...applied, skipped: plan.skipped, skippedReasons: plan.skippedReasons };
}
