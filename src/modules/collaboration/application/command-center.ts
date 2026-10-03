import { and, asc, eq, inArray, isNotNull, lt, notInArray } from 'drizzle-orm';
import { projects, taskExternalAssignments, tasks, vendors } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center/data/dg-ports';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';

const CRITICAL_PRIORITIES = ['high', 'urgent'] as const;
/** Closed or withdrawn. High priority is the critical tier; tasks have no separate `critical` value. */
const CLOSED_STATUSES = ['closed', 'cancelled'] as const;

/** Critical (high) and urgent contractor tasks whose due date has passed and that are not closed. */
export async function queryCriticalTasksOverdue(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const rows = await context.db
    .select({
      id: taskExternalAssignments.taskId,
      projectId: taskExternalAssignments.projectId,
      projectName: projects.name,
      vendorName: vendors.name,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(taskExternalAssignments)
    .innerJoin(
      tasks,
      and(eq(tasks.id, taskExternalAssignments.taskId), eq(tasks.organizationId, taskExternalAssignments.organizationId)),
    )
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, taskExternalAssignments.vendorId),
        eq(vendors.organizationId, taskExternalAssignments.organizationId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, taskExternalAssignments.projectId),
        eq(projects.organizationId, taskExternalAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(taskExternalAssignments.organizationId, context.organizationId),
        inArray(taskExternalAssignments.projectId, [...input.projectIds]),
        eq(tasks.isArchived, false),
        inArray(tasks.priority, [...CRITICAL_PRIORITIES]),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, input.today),
        notInArray(taskExternalAssignments.status, [...CLOSED_STATUSES]),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(taskExternalAssignments.taskId))
    .limit(input.limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    vendorName: row.vendorName,
    reference: row.title,
    dueDate: row.dueDate,
  }));
}
