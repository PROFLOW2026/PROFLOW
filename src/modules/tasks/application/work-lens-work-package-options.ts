import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { projects, workPackages } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { listWorkPackagesForProjects } from '@/modules/projects';

export interface WorkLensWorkPackageOption {
  readonly id: string;
  readonly name: string;
}

async function formatWorkPackageLabels(
  context: OrgContext,
  rows: ReadonlyArray<{ id: string; name: string; projectId: string }>,
  prefixProjectName: boolean,
): Promise<readonly WorkLensWorkPackageOption[]> {
  if (!prefixProjectName) {
    return rows.map((pkg) => ({ id: pkg.id, name: pkg.name }));
  }
  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  if (projectIds.length === 0) return [];
  const projectRows = await context.db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, context.organizationId), inArray(projects.id, projectIds)));
  const projectNames = new Map(projectRows.map((row) => [row.id, row.name]));
  return rows.map((pkg) => {
    const projectName = projectNames.get(pkg.projectId);
    return {
      id: pkg.id,
      name: projectName ? `${projectName} · ${pkg.name}` : pkg.name,
    };
  });
}

/** Work-package options for the /work lens filter bar (project-scoped or accessible projects). */
export async function listWorkLensWorkPackageOptions(
  context: OrgContext,
  projectId: string | undefined,
): Promise<readonly WorkLensWorkPackageOption[]> {
  if (projectId) {
    const packages = await listWorkPackagesForProjects(
      context.db,
      context.organizationId,
      [projectId],
    );
    return formatWorkPackageLabels(context, packages, false);
  }

  const accessibleProjectIds = await resolveAccessibleProjectIds(context);
  if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) return [];

  if (accessibleProjectIds === null) {
    const rows = await context.db
      .select({
        id: workPackages.id,
        name: workPackages.name,
        projectId: workPackages.projectId,
      })
      .from(workPackages)
      .where(
        and(eq(workPackages.organizationId, context.organizationId), isNull(workPackages.archivedAt)),
      )
      .orderBy(asc(workPackages.projectId), asc(workPackages.sortOrder), asc(workPackages.name));
    return formatWorkPackageLabels(context, rows, true);
  }

  const packages = await listWorkPackagesForProjects(
    context.db,
    context.organizationId,
    accessibleProjectIds,
  );
  return formatWorkPackageLabels(context, packages, accessibleProjectIds.length > 1);
}
