import type { OrgContext } from '@/shared/auth/context';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { loadEmployeeAppContextForUser } from './load-employee-app-context';

/** Attach employee app state and merge grant permissions into the effective set. */
export async function enrichOrgContextWithEmployeeApp(
  context: OrgContext,
): Promise<OrgContext> {
  if (!context.roleKeys.includes('employee')) return context;

  const employeeApp = await loadEmployeeAppContextForUser(context);
  if (!employeeApp) return context;

  const permissions = new Set<PermissionKey>(context.permissions);
  for (const [key, grant] of employeeApp.grants) {
    if (grant.granted) permissions.add(key);
  }

  return { ...context, employeeApp, permissions };
}
