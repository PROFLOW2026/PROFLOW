/**
 * Server-side data loader for task comments with author name enrichment.
 * Separate from the lean listComments() function so the UI can display names.
 */
import 'server-only';

import { asc, and, eq, lt, type SQL } from 'drizzle-orm';
import { taskComments, organizationMemberships, profiles, employees } from '@drizzle/schema';
import { withOrgContext } from '@/shared/auth/session';

export interface TaskCommentDisplayRow {
  id: string;
  body: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  authorName: string | null;
  authorActorId: string | null;
  isEmployee: boolean;
}

const PAGE_SIZE = 20;

export async function loadTaskCommentsForDisplay(
  taskId: string,
  beforeDate?: Date,
): Promise<{
  comments: TaskCommentDisplayRow[];
  hasMore: boolean;
  currentMembershipId: string | null;
}> {
  return withOrgContext(async (context) => {
    const conditions: SQL[] = [
      eq(taskComments.taskId, taskId),
      eq(taskComments.organizationId, context.organizationId),
    ];
    if (beforeDate) {
      conditions.push(lt(taskComments.createdAt, beforeDate));
    }

    const rows = await context.db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        isEdited: taskComments.isEdited,
        isDeleted: taskComments.isDeleted,
        createdAt: taskComments.createdAt,
        authorOrgMemberId: taskComments.authorOrgMemberId,
        authorEmployeeId: taskComments.authorEmployeeId,
        memberDisplayName: profiles.displayName,
        employeeFullName: employees.name,
      })
      .from(taskComments)
      .leftJoin(
        organizationMemberships,
        eq(taskComments.authorOrgMemberId, organizationMemberships.id),
      )
      .leftJoin(profiles, eq(organizationMemberships.userId, profiles.id))
      .leftJoin(employees, eq(taskComments.authorEmployeeId, employees.id))
      .where(and(...conditions))
      .orderBy(asc(taskComments.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasMore = rows.length > PAGE_SIZE;
    const slice = rows.slice(0, PAGE_SIZE);

    const comments: TaskCommentDisplayRow[] = slice.map((row) => ({
      id: row.id,
      body: row.body,
      isEdited: row.isEdited ?? false,
      isDeleted: row.isDeleted ?? false,
      createdAt: row.createdAt,
      authorName: row.memberDisplayName ?? row.employeeFullName ?? null,
      authorActorId: row.authorOrgMemberId ?? row.authorEmployeeId ?? null,
      isEmployee: row.authorEmployeeId !== null,
    }));

    return { comments, hasMore, currentMembershipId: context.membershipId };
  });
}
