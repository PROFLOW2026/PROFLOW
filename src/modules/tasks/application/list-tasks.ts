import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { listTasksPage } from '../data/tasks.repository';
import type { Task, TaskListFilters } from '../domain/types';
import { resolveAccessibleWorkspaceIds } from './accessible-workspaces';

export interface AccessibleTaskListPage {
  readonly tasks: Task[];
  readonly hasMore: boolean;
}

/**
 * Lists tasks scoped to caller-accessible workspaces.
 *
 * - WORKSPACES_MANAGE / full scope → all org workspaces
 * - TASKS_READ / member_only scope → org-visible + member workspaces only
 *
 * Supports server-side filtering by status/priority/assignee/label/due/project/board/bucket.
 */
export async function listAccessibleTasks(
  context: OrgContext,
  filters: TaskListFilters & { workspaceId?: string } = {},
): Promise<Task[]> {
  const page = await listAccessibleTasksPage(context, filters);
  return page.tasks;
}

/**
 * Same scope as listAccessibleTasks, plus an explicit truncation signal.
 * Default limit stays 50; the repository cap is 500.
 */
export async function listAccessibleTasksPage(
  context: OrgContext,
  filters: TaskListFilters & { workspaceId?: string } = {},
): Promise<AccessibleTaskListPage> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const [workspaceIds, accessibleProjectIds] = await Promise.all([
    resolveAccessibleWorkspaceIds(context, { workspaceId: filters.workspaceId }),
    resolveAccessibleProjectIds(context),
  ]);

  if (workspaceIds.length === 0) return { tasks: [], hasMore: false };

  return listTasksPage(context.db, context.organizationId, workspaceIds, filters, {
    accessibleProjectIds,
  });
}
