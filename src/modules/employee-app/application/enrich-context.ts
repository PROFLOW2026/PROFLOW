import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { listOrgMemberDocumentCategoryGrants } from '@/modules/employee-app';
import { isEmployeeAppUser, loadEmployeeAppContextForUser } from './load-employee-app-context';

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

async function loadMainOrgMemberDocumentCategoryGrants(
  context: OrgContext,
): Promise<ReadonlySet<DocumentCategory> | null> {
  if (isEmployeeAppUser(context)) return null;
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return new Set<DocumentCategory>();

  const categoryMap = await listOrgMemberDocumentCategoryGrants(
    context.db,
    context.organizationId,
    context.membershipId,
  );
  if (categoryMap.size === 0) return null;
  return new Set<DocumentCategory>(
    [...categoryMap.entries()].filter(([, allowed]) => allowed).map(([category]) => category),
  );
}

/** Attach employee app state and replace the effective permission set for app users. */
export async function enrichOrgContextWithEmployeeApp(
  context: OrgContext,
): Promise<OrgContext> {
  const documentCategoryGrants = await loadMainOrgMemberDocumentCategoryGrants(context);

  if (!context.roleKeys.includes('employee')) {
    return { ...context, documentCategoryGrants };
  }

  const employeeApp = await loadEmployeeAppContextForUser(context);
  if (!employeeApp) {
    return { ...context, documentCategoryGrants };
  }

  const permissions = resolveEmployeeAppEffectivePermissions(employeeApp.grants);

  return { ...context, employeeApp, permissions, documentCategoryGrants: null };
}
