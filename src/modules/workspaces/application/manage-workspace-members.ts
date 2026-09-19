import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findWorkspaceById,
  findWorkspaceMember,
  insertWorkspaceMember,
  deleteWorkspaceMember,
  updateWorkspaceMemberAccessLevel,
  listWorkspaceMembers,
} from '../data/workspaces.repository';
import type { WorkspaceMember, WorkspaceMemberAccessLevel } from '../domain/types';

export async function addWorkspaceMember(
  context: OrgContext,
  workspaceId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
  accessLevel: WorkspaceMemberAccessLevel = 'contributor',
): Promise<WorkspaceMember> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  if (!actor.orgMemberId && !actor.employeeId) {
    throw new ValidationError([
      { path: 'actor', message: 'Must supply orgMemberId or employeeId' },
    ]);
  }

  const existing = await findWorkspaceMember(context.db, workspaceId, actor);
  if (existing) throw new ConflictError('Member already belongs to this workspace');

  return insertWorkspaceMember(context.db, {
    workspaceId,
    organizationId: context.organizationId,
    orgMemberId: actor.orgMemberId ?? null,
    employeeId: actor.employeeId ?? null,
    accessLevel,
    addedByOrgMemberId: context.membershipId,
  });
}

export async function removeWorkspaceMember(
  context: OrgContext,
  workspaceId: string,
  workspaceMemberId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  await deleteWorkspaceMember(context.db, workspaceMemberId, context.organizationId);
}

export async function updateMemberAccessLevel(
  context: OrgContext,
  workspaceId: string,
  workspaceMemberId: string,
  accessLevel: WorkspaceMemberAccessLevel,
): Promise<WorkspaceMember> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  const updated = await updateWorkspaceMemberAccessLevel(
    context.db,
    workspaceMemberId,
    context.organizationId,
    accessLevel,
  );
  if (!updated) throw new NotFoundError('WorkspaceMember');
  return updated;
}

export async function getWorkspaceMembers(
  context: OrgContext,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  return listWorkspaceMembers(context.db, context.organizationId, workspaceId);
}
