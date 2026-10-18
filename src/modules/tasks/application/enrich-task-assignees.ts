import 'server-only';

import {
  mapEmployeeAvatarKeys,
  resolveIdentityImageUrls,
} from '@/modules/identity-images';
import type { DbExecutor } from '@/shared/db/types';
import type { TaskAssigneeDisplay } from '../ui/task-api';
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
  const employeeIds = [...new Set(rows.filter((row) => row.kind === 'employee').map((row) => row.id))];
  const keyByEmployee = await mapEmployeeAvatarKeys(db, organizationId, employeeIds);
  const urlByEmployee = await resolveIdentityImageUrls(keyByEmployee);

  const map = new Map<string, TaskAssigneeDisplay[]>();

  for (const row of rows) {
    const current = map.get(row.taskId) ?? [];
    current.push({
      id: row.id,
      displayName: row.displayName,
      avatarUrl:
        row.kind === 'employee' ? (urlByEmployee.get(row.id) ?? row.avatarUrl) : row.avatarUrl,
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
