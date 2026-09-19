import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, AuthorizationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  getWorkspaceDetailById,
  findWorkspaceMember,
} from '../data/workspaces.repository';
import { canViewWorkspace } from '../domain/access';
import type { WorkspaceDetail } from '../domain/types';

export async function getWorkspaceDetail(
  context: OrgContext,
  workspaceId: string,
): Promise<WorkspaceDetail> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const detail = await getWorkspaceDetailById(
    context.db,
    context.organizationId,
    workspaceId,
  );
  if (!detail) throw new NotFoundError('Workspace');

  // Check visibility
  const membership = await findWorkspaceMember(context.db, workspaceId, {
    orgMemberId: context.membershipId,
  });

  if (!canViewWorkspace(context, detail, membership)) {
    throw new AuthorizationError('workspace.view');
  }

  return detail;
}
