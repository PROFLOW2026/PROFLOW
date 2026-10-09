import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { parseWorkTaskListFilters } from '../domain/work-task-search-params';
import { listAccessibleTasksPage, type AccessibleTaskListPage } from './list-tasks';

export async function listAccessibleWorkLensTasksPage(
  context: OrgContext,
  urlParams: Record<string, string | string[] | undefined>,
  options: {
    limit?: number;
    offset?: number;
    excludeCancelled?: boolean;
    today: string;
  },
): Promise<AccessibleTaskListPage> {
  void options.today;
  const filters = parseWorkTaskListFilters(urlParams);

  const page = await listAccessibleTasksPage(context, {
    ...filters,
    limit: options.limit,
    offset: options.offset,
  });

  let tasks = page.tasks;
  if (options.excludeCancelled) {
    tasks = tasks.filter((task) => task.status !== 'cancelled');
  }

  return { tasks, hasMore: page.hasMore };
}
