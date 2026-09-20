import { and, asc, eq, inArray } from 'drizzle-orm';
import { employees, organizationMemberships, profiles, taskAssignees } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export interface TaskAssigneeDisplayRow {
  readonly taskId: string;
  readonly id: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Batch-load canonical task assignee display rows from `task_assignees`.
 * Supports both employee_id and org_member_id assignee types.
 */
export async function queryTaskAssigneeDisplayRows(
  db: DbExecutor,
  organizationId: string,
  taskIds: readonly string[],
): Promise<TaskAssigneeDisplayRow[]> {
  if (taskIds.length === 0) return [];

  const rows = await db
    .select({
      taskId: taskAssignees.taskId,
      employeeId: taskAssignees.employeeId,
      orgMemberId: taskAssignees.orgMemberId,
      employeeName: employees.name,
      memberDisplayName: profiles.displayName,
      memberEmail: profiles.email,
    })
    .from(taskAssignees)
    .leftJoin(
      employees,
      and(
        eq(employees.id, taskAssignees.employeeId),
        eq(employees.organizationId, taskAssignees.organizationId),
      ),
    )
    .leftJoin(organizationMemberships, eq(organizationMemberships.id, taskAssignees.orgMemberId))
    .leftJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(taskAssignees.organizationId, organizationId),
        inArray(taskAssignees.taskId, [...taskIds]),
      ),
    )
    .orderBy(asc(taskAssignees.assignedAt));

  return rows.map((row) => {
    if (row.employeeId) {
      return {
        taskId: row.taskId,
        id: row.employeeId,
        displayName: row.employeeName ?? null,
        avatarUrl: null,
      };
    }

    if (row.orgMemberId) {
      return {
        taskId: row.taskId,
        id: row.orgMemberId,
        displayName: row.memberDisplayName ?? row.memberEmail ?? null,
        avatarUrl: null,
      };
    }

    return {
      taskId: row.taskId,
      id: row.taskId,
      displayName: null,
      avatarUrl: null,
    };
  });
}
