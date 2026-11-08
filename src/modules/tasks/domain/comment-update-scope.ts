import { and, eq, type SQL } from 'drizzle-orm';
import { taskComments } from '@drizzle/schema';

/**
 * Comment body updates are scoped to the comment, its task, and the organization.
 * The author and soft-delete flags stay in the same predicate.
 */
export function taskCommentUpdateWhere(input: {
  readonly commentId: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly authorOrgMemberId: string;
}): SQL {
  const where = and(
    eq(taskComments.id, input.commentId),
    eq(taskComments.taskId, input.taskId),
    eq(taskComments.organizationId, input.organizationId),
    eq(taskComments.authorOrgMemberId, input.authorOrgMemberId),
    eq(taskComments.isDeleted, false),
  );
  if (!where) {
    throw new Error('task comment update scope is empty');
  }
  return where;
}
