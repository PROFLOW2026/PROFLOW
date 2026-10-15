import type { PlanningDependency } from '@/modules/planning/domain/types';
import type { TaskDependency } from './types';

/**
 * Maps UWM task dependencies to planning Gantt edges (FS only).
 * Task ids are used as work-item ids in {@link mapTaskCardsToGanttWorkItems}.
 */
export function mapTaskDependenciesToGantt(
  deps: readonly TaskDependency[],
  organizationId: string,
  projectIdFallback: string,
): PlanningDependency[] {
  const out: PlanningDependency[] = [];
  for (const dep of deps) {
    if (dep.dependencyType !== 'finish_to_start') continue;
    out.push({
      id: dep.id,
      organizationId,
      projectId: projectIdFallback,
      predecessorId: dep.sourceTaskId,
      successorId: dep.targetTaskId,
      type: 'finish_to_start',
      createdAt: dep.createdAt,
    });
  }
  return out;
}
