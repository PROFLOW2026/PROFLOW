import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, updateTaskById, insertTaskActivity } from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { Task } from '../domain/types';

/**
 * Soft-archives a task (isArchived = true).
 * TASKS_DELETE permission required.
 * Does NOT permanently delete.
 */
export async function archiveTask(context: OrgContext, taskId: string): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_DELETE);

  const existing = await findTaskById(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');

  if (existing.isArchived) {
    return existing; // idempotent
  }

  const updated = await updateTaskById(context.db, context.organizationId, taskId, {
    isArchived: true,
    archivedAt: new Date(),
    archivedByOrgMemberId: context.membershipId,
  });
  if (!updated) throw new NotFoundError('Task');

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'archived',
    payload: { archivedBy: context.membershipId },
  });

  return updated;
}
