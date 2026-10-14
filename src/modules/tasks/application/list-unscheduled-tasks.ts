import 'server-only';

import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { Task } from '../domain/types';
import { parseWorkTaskListFilters } from '../domain/work-task-search-params';
import { listAccessibleTasksPage } from './list-tasks';

const UNSCHEDULED_PAGE_SIZE = 50;

export interface UnscheduledTasksPage {
  readonly tasks: Task[];
  readonly hasMore: boolean;
}

/**
 * Tasks with no due date for the calendar "unscheduled" pool (respects work-lens URL filters).
 */
export async function listUnscheduledTasksPage(
  context: OrgContext,
  urlParams: Record<string, string | string[] | undefined>,
  options: { offset?: number } = {},
): Promise<UnscheduledTasksPage> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const base = parseWorkTaskListFilters(urlParams);
  const page = await listAccessibleTasksPage(context, {
    ...base,
    noDueDate: true,
    limit: UNSCHEDULED_PAGE_SIZE,
    offset: options.offset ?? 0,
    sort: { field: 'title', direction: 'asc' },
  });

  const tasks = page.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled');
  return { tasks, hasMore: page.hasMore };
}
