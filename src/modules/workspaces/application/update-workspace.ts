import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findWorkspaceById, updateWorkspaceById } from '../data/workspaces.repository';
import type { Workspace, UpdateWorkspaceInput } from '../domain/types';

export async function updateWorkspace(
  context: OrgContext,
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const existing = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!existing) throw new NotFoundError('Workspace');

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) {
    throw new ValidationError([{ path: 'name', message: 'Workspace name cannot be empty' }]);
  }

  const patch: Parameters<typeof updateWorkspaceById>[3] = {};

  if (name !== undefined) patch.name = name;
  if (input.workspaceVisibility !== undefined) patch.workspaceVisibility = input.workspaceVisibility;
  if (input.isReadOnly !== undefined) patch.isReadOnly = input.isReadOnly;

  // Closing workspace sets isReadOnly = true and records closedAt
  if (input.isReadOnly === true && !existing.closedAt) {
    patch.closedAt = new Date();
  }
  if (input.isReadOnly === false) {
    patch.closedAt = null;
  }

  // Archiving
  if (input.isArchived !== undefined) {
    patch.isArchived = input.isArchived;
    patch.archivedAt = input.isArchived ? (existing.archivedAt ?? new Date()) : null;
  }

  const updated = await updateWorkspaceById(
    context.db,
    context.organizationId,
    workspaceId,
    patch,
  );
  if (!updated) throw new NotFoundError('Workspace');
  return updated;
}
