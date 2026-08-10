import type {
  PlanningDependency,
  PlanningPlanSnapshot,
  PlanningWorkItem,
} from '../domain/types';

/**
 * Persistence port.
 *
 * Production uses Drizzle when `PLANNING_PERSISTENCE_READY`.
 * In-memory implementations are **test doubles only**.
 */
export interface PlanningRepository {
  getPlan(organizationId: string, projectId: string): Promise<PlanningPlanSnapshot>;
  upsertWorkItem(item: PlanningWorkItem): Promise<PlanningWorkItem>;
  archiveWorkItem(
    organizationId: string,
    projectId: string,
    workItemId: string,
    archivedAt: Date,
  ): Promise<void>;
  addDependency(dependency: PlanningDependency): Promise<PlanningDependency>;
  removeDependency(
    organizationId: string,
    projectId: string,
    dependencyId: string,
  ): Promise<void>;
}
