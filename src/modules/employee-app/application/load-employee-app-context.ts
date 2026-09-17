import type { OrgContext } from '@/shared/auth/context';
import type { PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import {
  findEmployeeAppAccountByUserId,
  findEmployeeAppAccountByEmployeeId,
} from '../data/accounts.repository';
import {
  listEmployeeDocumentCategoryGrants,
  listEmployeePermissionGrants,
} from '../data/grants.repository';
import type { EmployeeAppContext } from '../domain/types';

export function isActiveEmployeeAppAccount(
  account: {
    status: string;
    accessStartsAt: Date | null;
    accessEndsAt: Date | null;
    lockedUntil?: Date | null;
  },
  now = new Date(),
): boolean {
  if (account.status !== 'active' && account.status !== 'invited') return false;
  if (account.lockedUntil && account.lockedUntil > now) return false;
  if (account.accessStartsAt && account.accessStartsAt > now) return false;
  if (account.accessEndsAt && account.accessEndsAt < now) return false;
  return true;
}

export function isEmployeeAppUser(context: OrgContext): boolean {
  return context.roleKeys.includes('employee') && Boolean(context.employeeApp);
}

export async function loadEmployeeAppContextForUser(
  context: OrgContext,
): Promise<EmployeeAppContext | null> {
  if (!context.roleKeys.includes('employee')) return null;

  const account = await findEmployeeAppAccountByUserId(
    context.db,
    context.organizationId,
    context.userId,
  );
  if (!account || account.status === 'inactive') return null;

  const grantsList = await listEmployeePermissionGrants(
    context.db,
    context.organizationId,
    account.employeeId,
  );
  const grants = new Map<PermissionKey, (typeof grantsList)[number]>();
  for (const grant of grantsList) {
    if (grant.granted) grants.set(grant.permissionKey, grant);
  }

  const categoryMap = await listEmployeeDocumentCategoryGrants(
    context.db,
    context.organizationId,
    account.employeeId,
  );
  const allowedDocumentCategories =
    categoryMap.size > 0 ? new Set<DocumentCategory>(
        [...categoryMap.entries()].filter(([, allowed]) => allowed).map(([cat]) => cat),
      ) : null;

  return {
    account,
    employeeId: account.employeeId,
    grants,
    allowedDocumentCategories,
  };
}

export async function loadEmployeeAppContextByEmployeeId(
  context: OrgContext,
  employeeId: string,
): Promise<EmployeeAppContext | null> {
  const account = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    employeeId,
  );
  if (!account) return null;

  const grantsList = await listEmployeePermissionGrants(
    context.db,
    context.organizationId,
    employeeId,
  );
  const grants = new Map<PermissionKey, (typeof grantsList)[number]>();
  for (const grant of grantsList) {
    if (grant.granted) grants.set(grant.permissionKey, grant);
  }

  const categoryMap = await listEmployeeDocumentCategoryGrants(
    context.db,
    context.organizationId,
    employeeId,
  );
  const allowedDocumentCategories =
    categoryMap.size > 0 ? new Set<DocumentCategory>(
        [...categoryMap.entries()].filter(([, allowed]) => allowed).map(([cat]) => cat),
      ) : null;

  return { account, employeeId, grants, allowedDocumentCategories };
}

/** Effective permission for employee app users: role union + explicit grants. */
export function employeeHasPermission(
  context: OrgContext,
  permission: PermissionKey,
): boolean {
  if (context.permissions.has(permission)) return true;
  const grant = context.employeeApp?.grants.get(permission);
  return Boolean(grant?.granted);
}

export function employeePermissionScope(
  context: OrgContext,
  permission: PermissionKey,
): PermissionScope | null {
  const grant = context.employeeApp?.grants.get(permission);
  if (grant?.granted) return grant.scope;
  if (context.permissions.has(permission)) {
    return 'all_organization';
  }
  return null;
}
