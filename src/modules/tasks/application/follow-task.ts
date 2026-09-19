import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, upsertTaskFollower, deleteTaskFollower } from '../data/tasks.repository';

export async function followTask(context: OrgContext, taskId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  await upsertTaskFollower(context.db, {
    taskId,
    organizationId: context.organizationId,
    orgMemberId: context.membershipId,
  });
}

export async function unfollowTask(context: OrgContext, taskId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  await deleteTaskFollower(context.db, taskId, context.membershipId);
}
