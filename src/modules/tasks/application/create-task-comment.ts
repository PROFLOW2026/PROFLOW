import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, insertTaskComment, insertTaskActivity } from '../data/tasks.repository';
import { validateCommentAuthor } from '../domain/actor';
import type { TaskComment } from '../domain/types';

/**
 * Creates a comment on a task.
 *
 * Author MUST be a human (org member or employee). System actors cannot comment.
 */
export async function createComment(
  context: OrgContext,
  taskId: string,
  input: {
    body?: string;
    authorOrgMemberId?: string | null;
    authorEmployeeId?: string | null;
    /** When true, an empty body is allowed (attachment-only comment). */
    hasAttachments?: boolean;
  },
): Promise<TaskComment> {
  assertPermission(context, PERMISSIONS.TASKS_COMMENT);

  const body = input.body?.trim() ?? '';
  if (!body && !input.hasAttachments) {
    throw new ValidationError([
      { path: 'body', message: 'Comment text or at least one attachment is required' },
    ]);
  }

  const authorEmployeeId = input.authorEmployeeId ?? null;
  const authorOrgMemberId = authorEmployeeId
    ? null
    : (input.authorOrgMemberId ?? context.membershipId);

  validateCommentAuthor(authorOrgMemberId, authorEmployeeId);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const comment = await insertTaskComment(context.db, {
    taskId,
    organizationId: context.organizationId,
    authorOrgMemberId,
    authorEmployeeId,
    body,
  });

  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    actorOrgMemberId: authorEmployeeId ? null : authorOrgMemberId,
    actorEmployeeId: authorEmployeeId,
    actorSystem: false,
    eventType: 'comment_added',
    payload: { commentId: comment.id },
  });

  return comment;
}
