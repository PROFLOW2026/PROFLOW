import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { queryMyWork, type MyWorkView } from '../data/my-work.repository';
import { findWorkspaceIdsByActor, listWorkspacesForOrg } from '@/modules/workspaces';
import { getWorkspaceScope } from '@/modules/workspaces/domain/access';
import { findEmployeeByUserId } from '@/modules/workforce';
import type { Task } from '../domain/types';

export type { MyWorkView };

export interface MyWorkOptions {
  readonly view: MyWorkView;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Returns tasks for the caller's My Work views.
 *
 * Cross-workspace aggregation, scoped to caller-accessible workspaces.
 * Paginated.
 */
export async function getMyWork(
  context: OrgContext,
  options: MyWorkOptions,
): Promise<Task[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const scope = getWorkspaceScope(context);

  let workspaceIds: string[];

  if (scope === 'full') {
    const allWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId, {
      includeArchived: false,
    });
    workspaceIds = allWorkspaces.map((ws) => ws.id);
  } else {
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

  const linkedEmployee =
    context.employeeApp?.employeeId != null
      ? { id: context.employeeApp.employeeId }
      : await findEmployeeByUserId(context.db, context.organizationId, context.userId);

  return queryMyWork(context.db, {
    orgMemberId: context.membershipId,
    assigneeEmployeeId: linkedEmployee?.id ?? null,
    organizationId: context.organizationId,
    workspaceIds,
    view: options.view,
    limit: options.limit,
    offset: options.offset,
  });
}
