import type { OrgContext } from '@/shared/auth/context';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import { loadEffectivePermissionsForProject } from '../data/roles.repository';

/**
 * Verifies project access (0051 / grants) then merges project-scoped RBAC into
 * `context.permissions` for server actions and project surfaces.
 */
export async function scopeOrgContextToProject(
  context: OrgContext,
  projectId: string,
): Promise<OrgContext> {
  const { permissions, roleKeys } = await loadEffectivePermissionsForProject(
    context.db,
    context.organizationId,
    context.userId,
    projectId,
  );

  const merged: OrgContext = {
    ...context,
    permissions,
    roleKeys,
  };

  await assertCanAccessProject(merged, projectId);
  return merged;
}
