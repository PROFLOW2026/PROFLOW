import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import type { TaskAssigneeDisplay } from '../ui/_task-api-stub';
import { queryTaskAssigneeDisplayRows } from '../data/task-assignee-display.repository';

export type TaskAssigneeDisplayMap = ReadonlyMap<string, readonly TaskAssigneeDisplay[]>;

export async function loadTaskAssigneeDisplayMap(
  db: DbExecutor,
  organizationId: string,
  taskIds: readonly string[],
): Promise<TaskAssigneeDisplayMap> {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await queryTaskAssigneeDisplayRows(db, organizationId, uniqueIds);
  const map = new Map<string, TaskAssigneeDisplay[]>();

  for (const row of rows) {
    const current = map.get(row.taskId) ?? [];
    current.push({
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    });
    map.set(row.taskId, current);
  }

  return map;
}

export function assigneeDisplaysForTask(
  taskId: string,
  map: TaskAssigneeDisplayMap,
): readonly TaskAssigneeDisplay[] {
  return map.get(taskId) ?? [];
}
