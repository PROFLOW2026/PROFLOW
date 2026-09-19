import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  listWorkspacesForOrg,
  findWorkspaceIdsByActor,
} from '../data/workspaces.repository';
import { getWorkspaceScope } from '../domain/access';
import type { Workspace } from '../domain/types';

export interface ListWorkspacesOptions {
  readonly includeArchived?: boolean;
}

/**
 * Returns workspaces visible to the caller.
 *
 * - WORKSPACES_MANAGE → all non-archived workspaces
 * - TASKS_READ        → org-visible + member workspaces
 * - else              → AuthorizationError
 */
export async function listWorkspaces(
  context: OrgContext,
  options: ListWorkspacesOptions = {},
): Promise<Workspace[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const scope = getWorkspaceScope(context);

  if (scope === 'full') {
    return listWorkspacesForOrg(context.db, context.organizationId, {
      includeArchived: options.includeArchived,
    });
  }

  // member_only: fetch org-visible workspaces plus any the caller explicitly belongs to
  const memberWorkspaceIds = await findWorkspaceIdsByActor(
    context.db,
    context.organizationId,
    { orgMemberId: context.membershipId },
  );

  // Fetch org-visible ones + member ones; de-duplicate via union in the repo
  const [orgVisible, memberOnly] = await Promise.all([
    listWorkspacesForOrg(context.db, context.organizationId, {
      includeArchived: options.includeArchived,
      // org-visibility workspaces only
    }),
    memberWorkspaceIds.length > 0
      ? listWorkspacesForOrg(context.db, context.organizationId, {
          includeArchived: options.includeArchived,
          restrictToIds: memberWorkspaceIds,
        })
      : Promise.resolve([] as Workspace[]),
  ]);

  // Merge: org-visible come first, then member-only (restrict-scoped adds ones not already included)
  const seen = new Set<string>();
  const result: Workspace[] = [];

  for (const ws of orgVisible) {
    if (ws.workspaceVisibility === 'organization') {
      seen.add(ws.id);
      result.push(ws);
    }
  }
  for (const ws of memberOnly) {
    if (!seen.has(ws.id)) {
      seen.add(ws.id);
      result.push(ws);
    }
  }

  return result;
}
