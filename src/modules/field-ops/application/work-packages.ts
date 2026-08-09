import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listWorkPackagesForProjects } from '@/modules/projects';
import type { FieldOpsWorkPackageOption } from '../domain/types';

export type { FieldOpsWorkPackageOption };

/** Work-package options for field-ops create forms (project-scoped). */
export async function listFieldOpsWorkPackages(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<FieldOpsWorkPackageOption[]> {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  if (projectIds.length === 0) return [];

  const packages = await listWorkPackagesForProjects(
    context.db,
    context.organizationId,
    projectIds,
  );

  return packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    projectId: pkg.projectId,
  }));
}
