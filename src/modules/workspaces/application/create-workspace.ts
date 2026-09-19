import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { insertWorkspace } from '../data/workspaces.repository';
import type { Workspace, CreateWorkspaceInput } from '../domain/types';

export async function createWorkspace(
  context: OrgContext,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError([{ path: 'name', message: 'Workspace name is required' }]);
  }

  if (input.workspaceType === 'team' && !input.orgTeamId) {
    throw new ValidationError([
      { path: 'orgTeamId', message: 'Team workspace requires an orgTeamId' },
    ]);
  }

  return insertWorkspace(context.db, {
    organizationId: context.organizationId,
    name,
    workspaceType: input.workspaceType,
    workspaceVisibility: input.workspaceVisibility ?? 'organization',
    orgTeamId: input.orgTeamId ?? null,
    createdByOrgMemberId: context.membershipId,
  });
}
