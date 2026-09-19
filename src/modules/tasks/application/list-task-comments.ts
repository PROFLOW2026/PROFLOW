import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listTaskComments } from '../data/tasks.repository';
import type { TaskComment } from '../domain/types';

export async function listComments(
  context: OrgContext,
  taskId: string,
  options: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
): Promise<TaskComment[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  return listTaskComments(context.db, taskId, options);
}
