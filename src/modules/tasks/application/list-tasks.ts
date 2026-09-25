import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listTasksPage } from '../data/tasks.repository';
import { findWorkspaceIdsByActor, listWorkspacesForOrg } from '@/modules/workspaces';
import { getWorkspaceScope } from '@/modules/workspaces/domain/access';
import type { Task, TaskListFilters } from '../domain/types';

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
async function accessibleWorkspaceIds(
  context: OrgContext,
  filters: TaskListFilters & { workspaceId?: string },
): Promise<string[]> {
  if (filters.workspaceId) return [filters.workspaceId];

  const scope = getWorkspaceScope(context);
  if (scope === 'full') {
    const allWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId);
    return allWorkspaces.map((ws) => ws.id);
  }

  const memberIds = await findWorkspaceIdsByActor(context.db, context.organizationId, {
    orgMemberId: context.membershipId,
  });
  const orgVisibleWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId, {
    includeArchived: false,
  });
  const orgVisibleIds = orgVisibleWorkspaces
    .filter((ws) => ws.workspaceVisibility === 'organization')
    .map((ws) => ws.id);

  return Array.from(new Set([...orgVisibleIds, ...memberIds]));
}

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

  const workspaceIds = await accessibleWorkspaceIds(context, filters);
  if (workspaceIds.length === 0) return { tasks: [], hasMore: false };

  return listTasksPage(context.db, context.organizationId, workspaceIds, filters);
}
