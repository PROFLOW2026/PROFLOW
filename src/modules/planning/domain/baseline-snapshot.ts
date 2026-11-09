import type { PlanningWorkItem } from './types';

/** Frozen schedule row stored inside `planning_schedule_baseline_snapshots.items`. */
export interface BaselineScheduleItem {
  readonly workItemId: string;
  readonly name: string;
  readonly kind: PlanningWorkItem['kind'];
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly actualEndDate: string | null;
}

export type BaselineMutationOp = 'update' | 'delete';

const IMMUTABLE_BASELINE_OPS: ReadonlySet<BaselineMutationOp> = new Set(['update', 'delete']);

/**
 * Baseline headers and snapshot rows are append-only at the product layer.
 * SQL omits authenticated UPDATE/DELETE policies; this guard blocks app code paths.
 */
export function assertBaselineSnapshotImmutableOp(op: BaselineMutationOp): void {
  if (IMMUTABLE_BASELINE_OPS.has(op)) {
    throw new Error(`baseline snapshots are immutable (forbidden op: ${op})`);
  }
}

export function isBaselineSnapshotImmutableOp(op: string): op is BaselineMutationOp {
  return IMMUTABLE_BASELINE_OPS.has(op as BaselineMutationOp);
}

export function buildBaselineItemsFromWorkItems(
  workItems: readonly PlanningWorkItem[],
): BaselineScheduleItem[] {
  return workItems
    .filter((item) => item.archivedAt == null)
    .map((item) => ({
      workItemId: item.id,
      name: item.name,
      kind: item.kind,
      startDate: item.startDate,
      targetEndDate: item.targetEndDate,
      actualEndDate: item.actualEndDate,
    }));
}

export interface BaselineDateComparisonRow {
  readonly workItemId: string;
  readonly name: string;
  readonly baselineStartDate: string | null;
  readonly currentStartDate: string | null;
  readonly baselineTargetEndDate: string | null;
  readonly currentTargetEndDate: string | null;
  readonly startDeltaDays: number | null;
  readonly targetEndDeltaDays: number | null;
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayDelta(baseline: string | null, current: string | null): number | null {
  const a = parseIsoDate(baseline);
  const b = parseIsoDate(current);
  if (!a || !b) return null;
  const msPerDay = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export function compareBaselineToCurrent(
  baselineItems: readonly BaselineScheduleItem[],
  currentItems: readonly PlanningWorkItem[],
): BaselineDateComparisonRow[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  return baselineItems.map((baseline) => {
    const current = currentById.get(baseline.workItemId);
    const currentStart = current?.startDate ?? null;
    const currentTarget = current?.targetEndDate ?? null;
    return {
      workItemId: baseline.workItemId,
      name: baseline.name,
      baselineStartDate: baseline.startDate,
      currentStartDate: currentStart,
      baselineTargetEndDate: baseline.targetEndDate,
      currentTargetEndDate: currentTarget,
      startDeltaDays: dayDelta(baseline.startDate, currentStart),
      targetEndDeltaDays: dayDelta(baseline.targetEndDate, currentTarget),
    };
  });
}
