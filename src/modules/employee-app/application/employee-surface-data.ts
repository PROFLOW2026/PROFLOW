import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { projects, punchListItems } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { employeeHasPermission } from './load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIdsForUser } from './project-scope';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';

export async function listEmployeeAssignedProjects(
  context: OrgContext,
): Promise<Array<{ id: string; name: string; documentNumber: string | null; displayName: string }>> {
  if (!context.employeeApp?.employeeId) return [];
  if (!employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)) return [];

  const allowedProjectIds = await resolveAccessibleProjectIdsForUser(context);
  if (allowedProjectIds !== null && allowedProjectIds.length === 0) return [];

  const rows = await context.db
    .select({
      id: projects.id,
      name: projects.name,
      documentNumber: projects.documentNumber,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, context.organizationId),
        isNull(projects.archivedAt),
        ...(allowedProjectIds ? [inArray(projects.id, allowedProjectIds)] : []),
      ),
    )
    .orderBy(asc(projects.documentNumber), asc(projects.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    documentNumber: row.documentNumber,
    displayName: formatProjectDisplayName(row.name, row.documentNumber),
  }));
}

export async function listEmployeeAssignedTasks(
  context: OrgContext,
): Promise<Array<{ id: string; title: string; status: string; projectId: string | null }>> {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) return [];

  const allowedProjects = await resolveAccessibleProjectIdsForUser(context);
  const rows = await context.db
    .select({
      id: punchListItems.id,
      title: punchListItems.title,
      status: punchListItems.status,
      projectId: punchListItems.projectId,
    })
    .from(punchListItems)
    .where(
      and(
        eq(punchListItems.organizationId, context.organizationId),
        eq(punchListItems.assigneeEmployeeId, employeeId),
        isNull(punchListItems.archivedAt),
      ),
    )
    .limit(50);

  if (allowedProjects === null) return rows;
  return rows.filter((row) => !row.projectId || allowedProjects.includes(row.projectId));
}
