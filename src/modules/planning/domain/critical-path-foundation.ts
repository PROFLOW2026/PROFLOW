/**
 * Critical path foundation: validates the FS graph and runs CPM when dates are complete.
 *
 * Calendars, lag/lead, and resource leveling remain out of scope — see LIMITATION.md.
 */

import { computeCpm, durationDaysForCpm } from './compute-cpm';
import { isIsoDate } from './dates';
import { validateDependencyGraph } from './dependencies';
import type {
  CriticalPathFoundation,
  CriticalPathFoundationUnsupported,
  PlanningDependency,
  PlanningWorkItem,
} from './types';

function workItemHasCpmDates(item: PlanningWorkItem): boolean {
  if (item.archivedAt) return true;
  if (item.kind === 'milestone') {
    return isIsoDate(item.targetEndDate) || isIsoDate(item.startDate);
  }
  return isIsoDate(item.startDate) && isIsoDate(item.targetEndDate ?? item.startDate);
}

function allActiveItemsHaveCpmDates(workItems: readonly PlanningWorkItem[]): boolean {
  const active = workItems.filter((item) => !item.archivedAt);
  return active.length > 0 && active.every(workItemHasCpmDates);
}

function buildHeuristicLongestPath(input: {
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
  readonly topologicalOrder: readonly string[];
}): string[] {
  const preds = new Map<string, string[]>();
  for (const id of input.topologicalOrder) preds.set(id, []);
  for (const edge of input.dependencies) {
    if (!preds.has(edge.successorId)) continue;
    const list = preds.get(edge.successorId) ?? [];
    list.push(edge.predecessorId);
    preds.set(edge.successorId, list);
  }

  const byId = new Map(input.workItems.map((item) => [item.id, item]));
  const bestLen = new Map<string, number>();
  const bestPred = new Map<string, string | null>();

  for (const id of input.topologicalOrder) {
    let maxPred = 0;
    let chosen: string | null = null;
    for (const predId of preds.get(id) ?? []) {
      const cand = bestLen.get(predId) ?? 0;
      if (cand >= maxPred) {
        maxPred = cand;
        chosen = predId;
      }
    }
    bestLen.set(id, maxPred + durationDaysForCpm(byId.get(id)));
    bestPred.set(id, chosen);
  }

  let endId: string | null = null;
  let endLen = -1;
  for (const [id, len] of bestLen) {
    if (len > endLen) {
      endLen = len;
      endId = id;
    }
  }

  const path: string[] = [];
  let cursor = endId;
  while (cursor) {
    path.unshift(cursor);
    cursor = bestPred.get(cursor) ?? null;
  }
  return endLen > 0 ? path : [];
}

function unsupportedBase(
  limitationKey: CriticalPathFoundationUnsupported['limitationKey'],
  topologicalOrder: readonly string[],
  heuristicLongestPathIds: readonly string[],
): CriticalPathFoundationUnsupported {
  return {
    supported: false,
    limitationKey,
    topologicalOrder,
    heuristicLongestPathIds,
  };
}

export function buildCriticalPathFoundation(input: {
  readonly projectId: string;
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
}): CriticalPathFoundation {
  const graph = validateDependencyGraph({
    workItems: input.workItems,
    dependencies: input.dependencies,
    projectId: input.projectId,
  });

  if (!graph.ok) {
    return unsupportedBase('planning.criticalPath.unsafe', [], []);
  }

  const heuristicLongestPathIds = buildHeuristicLongestPath({
    workItems: input.workItems,
    dependencies: input.dependencies,
    topologicalOrder: graph.topologicalOrder,
  });

  if (!allActiveItemsHaveCpmDates(input.workItems)) {
    return unsupportedBase(
      'planning.criticalPath.missingDates',
      graph.topologicalOrder,
      heuristicLongestPathIds,
    );
  }

  const cpm = computeCpm({
    workItems: input.workItems,
    dependencies: input.dependencies,
    topologicalOrder: graph.topologicalOrder,
  });

  return {
    supported: true,
    topologicalOrder: graph.topologicalOrder,
    criticalPathIds: cpm.criticalPathIds,
    floatByWorkItemId: cpm.floatByWorkItemId,
    earlyStartByWorkItemId: cpm.earlyStartByWorkItemId,
    earlyFinishByWorkItemId: cpm.earlyFinishByWorkItemId,
    lateStartByWorkItemId: cpm.lateStartByWorkItemId,
    lateFinishByWorkItemId: cpm.lateFinishByWorkItemId,
  };
}
