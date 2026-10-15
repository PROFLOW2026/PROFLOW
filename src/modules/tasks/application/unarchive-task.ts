import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, updateTaskById, insertTaskActivity } from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { Task } from '../domain/types';

/**
 * Restores a soft-archived task (isArchived = false).
 * TASKS_DELETE permission required — same gate as archive.
 */
export async function unarchiveTask(context: OrgContext, taskId: string): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_DELETE);

  const existing = await findTaskById(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');

  if (!existing.isArchived) {
    return existing;
  }

  const updated = await updateTaskById(context.db, context.organizationId, taskId, {
    isArchived: false,
    archivedAt: null,
    archivedByOrgMemberId: null,
  });
  if (!updated) throw new NotFoundError('Task');

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'automation_changed',
    payload: { action: 'unarchived' },
  });

  return updated;
}
