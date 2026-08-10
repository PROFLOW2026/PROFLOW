/**
 * Durable planning persistence against `planning_work_items` / `planning_dependencies`.
 * Used when `PLANNING_PERSISTENCE_READY` is true (or directly in PGlite tests).
 */

import { and, asc, eq } from 'drizzle-orm';
import { planningDependencies, planningWorkItems } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  PlanningDependency,
  PlanningDependencyType,
  PlanningPlanSnapshot,
  PlanningWorkItem,
  PlanningWorkItemKind,
} from '../domain/types';
import type { PlanningRepository } from './planning.repository';

function mapWorkItem(row: typeof planningWorkItems.$inferSelect): PlanningWorkItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    kind: row.kind as PlanningWorkItemKind,
    startDate: row.startDate,
    targetEndDate: row.targetEndDate,
    actualEndDate: row.actualEndDate,
    progressPercent: Number(row.progressPercent),
    phaseId: row.phaseId,
    workPackageId: row.workPackageId,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDependency(row: typeof planningDependencies.$inferSelect): PlanningDependency {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    predecessorId: row.predecessorId,
    successorId: row.successorId,
    type: row.type as PlanningDependencyType,
    createdAt: row.createdAt,
  };
}

export function createDrizzlePlanningRepository(db: DbExecutor): PlanningRepository {
  return {
    async getPlan(organizationId, projectId): Promise<PlanningPlanSnapshot> {
      const workItemRows = await db
        .select()
        .from(planningWorkItems)
        .where(
          and(
            eq(planningWorkItems.organizationId, organizationId),
            eq(planningWorkItems.projectId, projectId),
          ),
        )
        .orderBy(asc(planningWorkItems.sortOrder), asc(planningWorkItems.name));

      const dependencyRows = await db
        .select()
        .from(planningDependencies)
        .where(
          and(
            eq(planningDependencies.organizationId, organizationId),
            eq(planningDependencies.projectId, projectId),
          ),
        );

      return {
        organizationId,
        projectId,
        workItems: workItemRows.map(mapWorkItem),
        dependencies: dependencyRows.map(mapDependency),
      };
    },

    async upsertWorkItem(item): Promise<PlanningWorkItem> {
      const [row] = await db
        .insert(planningWorkItems)
        .values({
          id: item.id,
          organizationId: item.organizationId,
          projectId: item.projectId,
          name: item.name,
          kind: item.kind,
          startDate: item.startDate,
          targetEndDate: item.targetEndDate,
          actualEndDate: item.actualEndDate,
          progressPercent: String(item.progressPercent),
          phaseId: item.phaseId,
          workPackageId: item.workPackageId,
          sortOrder: item.sortOrder,
          archivedAt: item.archivedAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })
        .onConflictDoUpdate({
          target: planningWorkItems.id,
          set: {
            name: item.name,
            kind: item.kind,
            startDate: item.startDate,
            targetEndDate: item.targetEndDate,
            actualEndDate: item.actualEndDate,
            progressPercent: String(item.progressPercent),
            phaseId: item.phaseId,
            workPackageId: item.workPackageId,
            sortOrder: item.sortOrder,
            archivedAt: item.archivedAt,
            updatedAt: item.updatedAt,
          },
        })
        .returning();
      return mapWorkItem(row!);
    },

    async archiveWorkItem(organizationId, projectId, workItemId, archivedAt) {
      await db
        .update(planningWorkItems)
        .set({ archivedAt, updatedAt: archivedAt })
        .where(
          and(
            eq(planningWorkItems.id, workItemId),
            eq(planningWorkItems.organizationId, organizationId),
            eq(planningWorkItems.projectId, projectId),
          ),
        );

      await db
        .delete(planningDependencies)
        .where(
          and(
            eq(planningDependencies.organizationId, organizationId),
            eq(planningDependencies.projectId, projectId),
            eq(planningDependencies.predecessorId, workItemId),
          ),
        );
      await db
        .delete(planningDependencies)
        .where(
          and(
            eq(planningDependencies.organizationId, organizationId),
            eq(planningDependencies.projectId, projectId),
            eq(planningDependencies.successorId, workItemId),
          ),
        );
    },

    async addDependency(dependency) {
      const [row] = await db
        .insert(planningDependencies)
        .values({
          id: dependency.id,
          organizationId: dependency.organizationId,
          projectId: dependency.projectId,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type,
          createdAt: dependency.createdAt,
        })
        .returning();
      return mapDependency(row!);
    },

    async removeDependency(organizationId, projectId, dependencyId) {
      await db
        .delete(planningDependencies)
        .where(
          and(
            eq(planningDependencies.id, dependencyId),
            eq(planningDependencies.organizationId, organizationId),
            eq(planningDependencies.projectId, projectId),
          ),
        );
    },
  };
}
