import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { loadEmployeeAppContextForUser } from './load-employee-app-context';

/** Baseline always available to active Employee App users (attendance self). */
const EMPLOYEE_APP_BASELINE: readonly PermissionKey[] = [PERMISSIONS.ATTENDANCE_SELF];

/**
 * Employee App effective permissions: explicit grants + attendance baseline only.
 * Role keys like `org.read` must not unlock Owner dashboard/settings surfaces.
 */
export function resolveEmployeeAppEffectivePermissions(
  grants: ReadonlyMap<PermissionKey, { readonly granted: boolean }>,
): Set<PermissionKey> {
  const permissions = new Set<PermissionKey>(EMPLOYEE_APP_BASELINE);
  for (const [key, grant] of grants) {
    if (grant.granted) permissions.add(key);
  }
  return permissions;
}

/** Attach employee app state and replace the effective permission set for app users. */
export async function enrichOrgContextWithEmployeeApp(
  context: OrgContext,
): Promise<OrgContext> {
  if (!context.roleKeys.includes('employee')) return context;

  const employeeApp = await loadEmployeeAppContextForUser(context);
  if (!employeeApp) return context;

  const permissions = resolveEmployeeAppEffectivePermissions(employeeApp.grants);

  return { ...context, employeeApp, permissions };
}
