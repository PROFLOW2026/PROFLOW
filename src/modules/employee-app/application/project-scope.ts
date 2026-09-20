import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { employeeProjectAssignments } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import {
  getStoredProjectAccessMode,
  listAccessibleProjectIdsForUser,
} from '@/modules/projects/data/index';
import {
  employeeHasPermission,
  employeePermissionScope,
  isEmployeeAppUser,
} from './load-employee-app-context';
import type { PermissionScope } from '@/shared/permissions/scopes';
import { todayInTimeZone } from '@/shared/dates';
import type { PermissionKey } from '@/shared/permissions/catalog';

async function listAssignedProjectIdsForEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<string[]> {
  const today = todayInTimeZone(context.organization.timezone);
  const rows = await context.db
    .select({ projectId: employeeProjectAssignments.projectId })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, context.organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.status, 'active'),
        lte(employeeProjectAssignments.startDate, today),
        or(
          isNull(employeeProjectAssignments.endDate),
          sql`${employeeProjectAssignments.endDate} >= ${today}`,
        ),
      ),
    );
  return [...new Set(rows.map((row) => row.projectId))];
}

/**
 * Resolves project IDs accessible to the current user for a specific employee permission.
 */
export async function resolveAccessibleProjectIdsForEmployeePermission(
  context: OrgContext,
  permission: PermissionKey,
): Promise<string[] | null> {
  if (hasPermission(context, PERMISSIONS.PROJECTS_ACCESS_ALL)) {
    return null;
  }

  if (isEmployeeAppUser(context) && context.employeeApp) {
    if (!employeeHasPermission(context, permission)) return [];

    const scope = employeePermissionScope(context, permission) ?? 'assigned_only';

    if (scope === 'all_organization') return null;
    if (scope === 'granted_projects') {
      const mode = await getStoredProjectAccessMode(context.db, context.organizationId);
      return listAccessibleProjectIdsForUser(
        context.db,
        context.organizationId,
        context.userId,
        mode,
      );
    }
    return listAssignedProjectIdsForEmployee(context, context.employeeApp.employeeId);
  }

  const mode = await getStoredProjectAccessMode(context.db, context.organizationId);
  return listAccessibleProjectIdsForUser(
    context.db,
    context.organizationId,
    context.userId,
    mode,
  );
}

/**
 * Resolves project IDs accessible to the current user.
 * Employee App users primary source: employee_project_assignments.
 */
export async function resolveAccessibleProjectIdsForUser(
  context: OrgContext,
): Promise<string[] | null> {
  if (hasPermission(context, PERMISSIONS.PROJECTS_ACCESS_ALL)) {
    return null;
  }

  if (isEmployeeAppUser(context) && context.employeeApp) {
    const projectsRead =
      employeeHasPermission(context, PERMISSIONS.PROJECTS_READ) ||
      hasPermission(context, PERMISSIONS.PROJECTS_READ);
    if (!projectsRead) return [];

    return resolveAccessibleProjectIdsForEmployeePermission(context, PERMISSIONS.PROJECTS_READ);
  }

  const mode = await getStoredProjectAccessMode(context.db, context.organizationId);
  return listAccessibleProjectIdsForUser(
    context.db,
    context.organizationId,
    context.userId,
    mode,
  );
}

export async function assertCanAccessProjectForUser(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const allowed = await resolveAccessibleProjectIdsForUser(context);
  if (allowed === null) return;
  if (!allowed.includes(projectId)) throw new NotFoundError('Project');
}

export async function assertEmployeeProjectScope(
  context: OrgContext,
  permission: PermissionKey,
  projectId: string,
  scope?: PermissionScope | null,
): Promise<void> {
  if (!isEmployeeAppUser(context)) {
    await assertCanAccessProjectForUser(context, projectId);
    return;
  }
  const effectiveScope = scope ?? employeePermissionScope(context, permission) ?? 'assigned_only';
  if (effectiveScope === 'all_organization') return;
  if (effectiveScope === 'granted_projects') {
    await assertCanAccessProjectForUser(context, projectId);
    return;
  }
  if (!context.employeeApp) throw new NotFoundError('Project');
  const assigned = await listAssignedProjectIdsForEmployee(
    context,
    context.employeeApp.employeeId,
  );
  if (!assigned.includes(projectId)) throw new NotFoundError('Project');
}
