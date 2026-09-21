/**
 * Task dependency cycle detection.
 *
 * DFS-based cycle detection. Returns true when adding newDepId as a
 * dependency of taskId would create a cycle.
 */

import type { TaskDependencyType } from './types';

interface DepEdge {
  readonly sourceTaskId: string;
  readonly targetTaskId: string;
}

/**
 * Detects whether adding an edge (taskId → newDepId) would create a cycle
 * in the dependency graph.
 *
 * @param taskId   The task that will have the new dependency added to it
 * @param newDepId The task that taskId would now depend on (target)
 * @param allDeps  All existing dependency edges in scope
 * @returns true if adding the edge would create a cycle
 */
export function detectCycle(
  taskId: string,
  newDepId: string,
  allDeps: readonly DepEdge[],
): boolean {
  // A dependency edge means: sourceTaskId depends on targetTaskId
  // (source must wait for target). Adding (taskId → newDepId) creates a cycle
  // if newDepId can reach taskId through existing edges.

  // Adjacency: sourceTaskId → targetTaskIds it depends on (must complete first).
  const graph = new Map<string, Set<string>>();

  for (const dep of allDeps) {
    const set = graph.get(dep.sourceTaskId) ?? new Set<string>();
    set.add(dep.targetTaskId);
    graph.set(dep.sourceTaskId, set);
  }

  // Adding (taskId → newDepId) cycles if newDepId already depends on taskId.
  const visited = new Set<string>();
  const stack = [newDepId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const prerequisites = graph.get(current);
    if (prerequisites) {
      for (const prerequisite of prerequisites) {
        if (!visited.has(prerequisite)) {
          stack.push(prerequisite);
        }
      }
    }
  }

  return false;
}

/**
 * Returns true when the edge (sourceTaskId → targetTaskId) already exists.
 */
export function edgeExists(
  allDeps: readonly DepEdge[],
  sourceTaskId: string,
  targetTaskId: string,
  _dependencyType: TaskDependencyType,
): boolean {
  return allDeps.some(
    (d) =>
      d.sourceTaskId === sourceTaskId &&
      d.targetTaskId === targetTaskId,
  );
}
