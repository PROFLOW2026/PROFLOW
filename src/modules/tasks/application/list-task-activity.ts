import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listTaskActivity } from '../data/tasks.repository';
import type { TaskActivity } from '../domain/types';

/**
 * Returns the append-only activity log for a task (paginated).
 * Ordered chronologically (oldest first).
 */
export async function listActivity(
  context: OrgContext,
  taskId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<TaskActivity[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  return listTaskActivity(context.db, taskId, options);
}
