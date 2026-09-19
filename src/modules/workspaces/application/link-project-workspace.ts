import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConflictError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findWorkspaceById,
  findProjectWorkspaceLink,
  insertProjectWorkspaceLink,
  deleteProjectWorkspaceLink,
} from '../data/workspaces.repository';
import type { ProjectWorkspaceLink } from '../domain/types';

/**
 * Links a project to a workspace.
 * Enforces UNIQUE(workspace_id, project_id) — throws ConflictError when already linked.
 */
export async function linkProjectToWorkspace(
  context: OrgContext,
  workspaceId: string,
  projectId: string,
  options: { relationshipRole?: string | null } = {},
): Promise<ProjectWorkspaceLink> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  const existing = await findProjectWorkspaceLink(context.db, workspaceId, projectId);
  if (existing) throw new ConflictError('Project is already linked to this workspace');

  return insertProjectWorkspaceLink(context.db, {
    workspaceId,
    projectId,
    relationshipRole: options.relationshipRole ?? null,
  });
}

/**
 * Removes a project ↔ workspace link.
 */
export async function unlinkProject(
  context: OrgContext,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  await deleteProjectWorkspaceLink(context.db, workspaceId, projectId);
}
