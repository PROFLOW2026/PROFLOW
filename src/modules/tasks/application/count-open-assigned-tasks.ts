import { and, eq, inArray, sql } from 'drizzle-orm';
import { taskAssignees, tasks } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const OPEN_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked'] as const;

export async function countOpenAuthorizedTasksForMember(context: OrgContext): Promise<number> {
  if (!hasPermission(context, PERMISSIONS.TASKS_READ)) return 0;

  const result = await context.db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
    .where(
      and(
        eq(tasks.organizationId, context.organizationId),
        eq(taskAssignees.orgMemberId, context.membershipId),
        inArray(tasks.status, [...OPEN_STATUSES]),
      ),
    );
  return result[0]?.count ?? 0;
}
