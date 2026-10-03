import { and, eq } from 'drizzle-orm';
import { taskExternalAssignments, tasks } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/**
 * `task`: a row of the existing task engine. Contractor-facing only when it carries a contractor
 * assignment (task_external_assignments); every other task is internal-only. Uses the caller's
 * RLS-bound executor, so a contractor resolves only tasks of its own vendor within grant scope.
 */
const taskResolver: EntityAccessResolver = {
  entityType: 'task',
  async resolve(db, organizationId, entityId) {
    const [row] = await db
      .select({
        organizationId: tasks.organizationId,
        projectId: tasks.projectId,
        vendorId: taskExternalAssignments.vendorId,
        subcontractAgreementId: taskExternalAssignments.subcontractAgreementId,
      })
      .from(tasks)
      .leftJoin(
        taskExternalAssignments,
        and(
          eq(taskExternalAssignments.taskId, tasks.id),
          eq(taskExternalAssignments.organizationId, tasks.organizationId),
        ),
      )
      .where(and(eq(tasks.id, entityId), eq(tasks.organizationId, organizationId)))
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      projectId: row.projectId,
      vendorId: row.vendorId ?? null,
      subcontractAgreementId: row.subcontractAgreementId ?? null,
      internalOnly: row.vendorId == null,
    };
  },
};

/** Entity access resolvers owned by the 'collab' track. One resolver per entity type that supports threads/attachments/evidence. */
export const COLLAB_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [taskResolver];
