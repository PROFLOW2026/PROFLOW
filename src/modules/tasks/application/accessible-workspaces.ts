import type { OrgContext } from '@/shared/auth/context';
import { findWorkspaceIdsByActor, listWorkspacesForOrg } from '@/modules/workspaces';
import { getWorkspaceScope } from '@/modules/workspaces/domain/access';

export interface AccessibleWorkspaceOptions {
  readonly workspaceId?: string;
}

/**
 * Workspace IDs the caller may use for task list / My Work queries.
 * Resolves once per request and mirrors list-workspaces member + org-visible rules.
 */
export async function resolveAccessibleWorkspaceIds(
  context: OrgContext,
  options: AccessibleWorkspaceOptions = {},
): Promise<string[]> {
  if (options.workspaceId) return [options.workspaceId];

  const scope = getWorkspaceScope(context);
  if (scope === 'full') {
    const allWorkspaces = await listWorkspacesForOrg(context.db, context.organizationId, {
      includeArchived: false,
    });
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
