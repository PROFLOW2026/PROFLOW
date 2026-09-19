import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { getTaskDetail as getTaskDetailFromRepo } from '../data/tasks.repository';
import type { TaskDetail } from '../domain/types';

/**
 * Returns full task detail including assignees, checklist, labels, recent activity, comment count.
 */
export async function getTaskDetail(
  context: OrgContext,
  taskId: string,
  options: { activityLimit?: number } = {},
): Promise<TaskDetail> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const detail = await getTaskDetailFromRepo(
    context.db,
    context.organizationId,
    taskId,
    options,
  );

  if (!detail) throw new NotFoundError('Task');
  return detail;
}
