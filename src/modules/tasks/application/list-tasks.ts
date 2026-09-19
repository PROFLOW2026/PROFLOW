import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listTasks } from '../data/tasks.repository';
import { findWorkspaceIdsByActor, listWorkspacesForOrg } from '@/modules/workspaces';
import { getWorkspaceScope } from '@/modules/workspaces/domain/access';
import type { Task, TaskListFilters } from '../domain/types';

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
  assertPermission(context, PERMISSIONS.TASKS_READ);

  let workspaceIds: string[];

  if (filters.workspaceId) {
    // Scoped to a specific workspace
    workspaceIds = [filters.workspaceId];
  } else {
    const scope = getWorkspaceScope(context);
    if (scope === 'full') {
      const allWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId);
      workspaceIds = allWorkspaces.map((ws) => ws.id);
    } else {
      // member_only: org-visible workspaces + member workspaces
      const memberIds = await findWorkspaceIdsByActor(
        context.db,
        context.organizationId,
        { orgMemberId: context.membershipId },
      );
      const orgVisibleWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId, {
        includeArchived: false,
      });
      const orgVisibleIds = orgVisibleWorkspaces
        .filter((ws) => ws.workspaceVisibility === 'organization')
        .map((ws) => ws.id);

      const seen = new Set([...orgVisibleIds, ...memberIds]);
      workspaceIds = Array.from(seen);
    }
  }

  if (workspaceIds.length === 0) return [];

  return listTasks(context.db, context.organizationId, workspaceIds, filters);
}
