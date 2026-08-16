/**
 * Dependency graph validation - cycle detection (Kahn topological sort).
 * V1 supports finish-to-start edges only.
 */

import type { PlanningDependency, PlanningWorkItem } from './types';

export const DEPENDENCY_CYCLE_MESSAGE = 'planning.dependency.cycle';
export const DEPENDENCY_UNKNOWN_ITEM_MESSAGE = 'planning.dependency.unknownItem';
export const DEPENDENCY_SELF_MESSAGE = 'planning.dependency.self';
export const DEPENDENCY_CROSS_PROJECT_MESSAGE = 'planning.dependency.crossProject';

export interface DependencyValidationOk {
  readonly ok: true;
  readonly topologicalOrder: readonly string[];
}

export interface DependencyValidationFail {
  readonly ok: false;
  readonly message: string;
  /** Nodes involved in a detected cycle (best-effort). */
  readonly cycleNodeIds: readonly string[];
}

export type DependencyValidationResult = DependencyValidationOk | DependencyValidationFail;

export function validateDependencyGraph(input: {
  readonly workItems: readonly Pick<PlanningWorkItem, 'id' | 'projectId' | 'archivedAt'>[];
  readonly dependencies: readonly Pick<
    PlanningDependency,
    'predecessorId' | 'successorId' | 'projectId'
  >[];
  readonly projectId: string;
}): DependencyValidationResult {
  const activeIds = new Set(
    input.workItems.filter((item) => !item.archivedAt).map((item) => item.id),
  );

  for (const edge of input.dependencies) {
    if (edge.projectId !== input.projectId) {
      return {
        ok: false,
        message: DEPENDENCY_CROSS_PROJECT_MESSAGE,
        cycleNodeIds: [],
      };
    }
    if (edge.predecessorId === edge.successorId) {
      return { ok: false, message: DEPENDENCY_SELF_MESSAGE, cycleNodeIds: [edge.predecessorId] };
    }
    if (!activeIds.has(edge.predecessorId) || !activeIds.has(edge.successorId)) {
      return {
        ok: false,
        message: DEPENDENCY_UNKNOWN_ITEM_MESSAGE,
        cycleNodeIds: [edge.predecessorId, edge.successorId].filter((id) => !activeIds.has(id)),
      };
    }
  }

  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of activeIds) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const edge of input.dependencies) {
    adjacency.get(edge.predecessorId)!.push(edge.successorId);
    indegree.set(edge.successorId, (indegree.get(edge.successorId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) queue.push(id);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    topologicalOrder.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (topologicalOrder.length !== activeIds.size) {
    const remaining = [...activeIds].filter((id) => !topologicalOrder.includes(id));
    return {
      ok: false,
      message: DEPENDENCY_CYCLE_MESSAGE,
      cycleNodeIds: remaining,
    };
  }

  return { ok: true, topologicalOrder };
}

/** True when adding `edge` would introduce a cycle (or other validation failure). */
export function wouldCreateCycle(input: {
  readonly workItems: readonly Pick<PlanningWorkItem, 'id' | 'projectId' | 'archivedAt'>[];
  readonly dependencies: readonly Pick<
    PlanningDependency,
    'predecessorId' | 'successorId' | 'projectId'
  >[];
  readonly projectId: string;
  readonly edge: Pick<PlanningDependency, 'predecessorId' | 'successorId' | 'projectId'>;
}): boolean {
  const result = validateDependencyGraph({
    workItems: input.workItems,
    dependencies: [...input.dependencies, input.edge],
    projectId: input.projectId,
  });
  return !result.ok && result.message === DEPENDENCY_CYCLE_MESSAGE;
}

/**
 * Walk predecessor chains for a work item (direct + transitive).
 * Used by Gantt UI to highlight dependency chains.
 */
export function collectPredecessorChain(
  workItemId: string,
  dependencies: readonly Pick<PlanningDependency, 'predecessorId' | 'successorId'>[],
): readonly string[] {
  const predsBySuccessor = new Map<string, string[]>();
  for (const edge of dependencies) {
    const list = predsBySuccessor.get(edge.successorId) ?? [];
    list.push(edge.predecessorId);
    predsBySuccessor.set(edge.successorId, list);
  }

  const seen = new Set<string>();
  const stack = [...(predsBySuccessor.get(workItemId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const pred of predsBySuccessor.get(id) ?? []) {
      if (!seen.has(pred)) stack.push(pred);
    }
  }
  return [...seen];
}
