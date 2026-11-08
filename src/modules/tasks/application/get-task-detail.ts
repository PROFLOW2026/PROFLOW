import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { getTaskDetail as getTaskDetailFromRepo } from '../data/tasks.repository';
import type { TaskDetail } from '../domain/types';
import { assertCanAccessTask } from './assert-task-access';

/**
 * Full task detail. A missing task is NotFoundError.
 * Project access denial is AuthorizationError, not a silent miss.
 */
export async function getTaskDetail(
  context: OrgContext,
  taskId: string,
  options: { activityLimit?: number } = {},
): Promise<TaskDetail> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  try {
    await assertCanAccessTask(context, taskId);
  } catch (error) {
    if (error instanceof NotFoundError && error.details?.resource === 'Project') {
      throw new AuthorizationError('task.view');
    }
    throw error;
  }

  const detail = await getTaskDetailFromRepo(
    context.db,
    context.organizationId,
    taskId,
    options,
  );

  if (!detail) throw new NotFoundError('Task');
  return detail;
}
