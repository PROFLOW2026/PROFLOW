/**
 * Critical Path Method (CPM) on `planning_work_items`.
 *
 * V1 constraints:
 * - Finish-to-start dependencies only (zero lag).
 * - Durations from inclusive calendar days between planned dates.
 * - Default calendar: 7-day work week (every day counts; no holidays yet).
 *
 * See LIMITATION.md for remaining gaps (lag/lead, SS/FF/SF, resource leveling).
 */

import { inclusiveDurationDays } from './dates';
import type { PlanningDependency, PlanningWorkItem } from './types';

export interface CpmScheduleMaps {
  readonly earlyStartByWorkItemId: Readonly<Record<string, number>>;
  readonly earlyFinishByWorkItemId: Readonly<Record<string, number>>;
  readonly lateStartByWorkItemId: Readonly<Record<string, number>>;
  readonly lateFinishByWorkItemId: Readonly<Record<string, number>>;
  readonly floatByWorkItemId: Readonly<Record<string, number>>;
  readonly criticalPathIds: readonly string[];
  readonly projectEndDay: number;
}

export function durationDaysForCpm(item: PlanningWorkItem | undefined): number {
  if (!item || item.archivedAt) return 0;
  return inclusiveDurationDays(
    item.startDate,
    item.targetEndDate ?? item.startDate,
    item.kind === 'milestone',
  );
}

/**
 * Forward / backward pass on an acyclic FS network.
 * Day indices are relative CPM offsets (day 0 = earliest possible start).
 */
export function computeCpm(input: {
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
  readonly topologicalOrder: readonly string[];
}): CpmScheduleMaps {
  const byId = new Map(input.workItems.map((item) => [item.id, item]));
  const activeOrder = input.topologicalOrder.filter((id) => {
    const item = byId.get(id);
    return item && !item.archivedAt;
  });

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const id of activeOrder) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const edge of input.dependencies) {
    if (!preds.has(edge.successorId) || !preds.has(edge.predecessorId)) continue;
    preds.get(edge.successorId)!.push(edge.predecessorId);
    succs.get(edge.predecessorId)!.push(edge.successorId);
  }

  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of activeOrder) {
    const duration = durationDaysForCpm(byId.get(id));
    const predecessorFinishes = (preds.get(id) ?? []).map((p) => earlyFinish.get(p) ?? 0);
    const es =
      predecessorFinishes.length === 0 ? 0 : Math.max(...predecessorFinishes) + 1;
    const ef = duration === 0 ? es : es + duration - 1;
    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  const projectEndDay =
    activeOrder.length === 0
      ? 0
      : Math.max(...activeOrder.map((id) => earlyFinish.get(id) ?? 0));

  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  for (let i = activeOrder.length - 1; i >= 0; i -= 1) {
    const id = activeOrder[i]!;
    const duration = durationDaysForCpm(byId.get(id));
    const successorStarts = (succs.get(id) ?? []).map((s) => lateStart.get(s) ?? 0);
    const lf =
      successorStarts.length === 0
        ? projectEndDay
        : Math.min(...successorStarts.map((ls) => ls - 1));
    const ls = duration === 0 ? lf : lf - duration + 1;
    lateStart.set(id, ls);
    lateFinish.set(id, lf);
  }

  const earlyStartByWorkItemId: Record<string, number> = {};
  const earlyFinishByWorkItemId: Record<string, number> = {};
  const lateStartByWorkItemId: Record<string, number> = {};
  const lateFinishByWorkItemId: Record<string, number> = {};
  const floatByWorkItemId: Record<string, number> = {};

  for (const id of activeOrder) {
    const es = earlyStart.get(id) ?? 0;
    const ef = earlyFinish.get(id) ?? 0;
    const ls = lateStart.get(id) ?? 0;
    const lf = lateFinish.get(id) ?? 0;
    earlyStartByWorkItemId[id] = es;
    earlyFinishByWorkItemId[id] = ef;
    lateStartByWorkItemId[id] = ls;
    lateFinishByWorkItemId[id] = lf;
    floatByWorkItemId[id] = ls - es;
  }

  const criticalPathIds = activeOrder.filter((id) => floatByWorkItemId[id] === 0);

  return {
    earlyStartByWorkItemId,
    earlyFinishByWorkItemId,
    lateStartByWorkItemId,
    lateFinishByWorkItemId,
    floatByWorkItemId,
    criticalPathIds,
    projectEndDay,
  };
}
