import 'server-only';

import { listAccessibleTasks } from '@/modules/tasks';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';

export interface TimeLogTaskOption {
  readonly id: string;
  readonly name: string;
}

/** Tasks the caller may attribute when logging project time. */
export async function listTasksForTimeLog(
  context: OrgContext,
  projectId: string,
): Promise<readonly TimeLogTaskOption[]> {
  if (!hasPermission(context, PERMISSIONS.TASKS_READ)) return [];

  const rows = await listAccessibleTasks(context, {
    projectId,
    limit: 200,
    includeArchived: false,
  });

  return rows.map((task) => ({ id: task.id, name: task.title }));
}
