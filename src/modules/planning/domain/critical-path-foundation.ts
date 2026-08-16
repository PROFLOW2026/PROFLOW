/**
 * Critical Path foundations only - NOT a true CPM engine.
 *
 * Unsafe to present as Critical Path without working calendars, lag/lead,
 * resource leveling, and float computation. See LIMITATION.md.
 */

import { validateDependencyGraph } from './dependencies';
import { inclusiveDurationDays } from './dates';
import type {
  CriticalPathFoundation,
  PlanningDependency,
  PlanningWorkItem,
} from './types';

/**
 * Returns topological order + a calendar-day longest-path heuristic.
 * Always marks `supported: false` so UI never claims Critical Path.
 */
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
    return {
      supported: false,
      limitationKey: 'planning.criticalPath.unsafe',
      topologicalOrder: [],
      heuristicLongestPathIds: [],
    };
  }

  const byId = new Map(input.workItems.map((item) => [item.id, item]));
  const duration = (id: string): number => {
    const item = byId.get(id);
    if (!item || item.archivedAt) return 0;
    return inclusiveDurationDays(
      item.startDate,
      item.targetEndDate ?? item.startDate,
      item.kind === 'milestone',
    );
  };

  const preds = new Map<string, string[]>();
  for (const id of graph.topologicalOrder) preds.set(id, []);
  for (const edge of input.dependencies) {
    const list = preds.get(edge.successorId) ?? [];
    list.push(edge.predecessorId);
    preds.set(edge.successorId, list);
  }

  const bestLen = new Map<string, number>();
  const bestPred = new Map<string, string | null>();
  for (const id of graph.topologicalOrder) {
    let maxPred = 0;
    let chosen: string | null = null;
    for (const predId of preds.get(id) ?? []) {
      const cand = bestLen.get(predId) ?? 0;
      if (cand >= maxPred) {
        maxPred = cand;
        chosen = predId;
      }
    }
    bestLen.set(id, maxPred + duration(id));
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

  const heuristicLongestPathIds: string[] = [];
  let cursor = endId;
  while (cursor) {
    heuristicLongestPathIds.unshift(cursor);
    cursor = bestPred.get(cursor) ?? null;
  }

  return {
    supported: false,
    limitationKey: 'planning.criticalPath.unsafe',
    topologicalOrder: graph.topologicalOrder,
    heuristicLongestPathIds: endLen > 0 ? heuristicLongestPathIds : [],
  };
}
