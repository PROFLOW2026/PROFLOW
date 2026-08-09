import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { EnabledImportKind, ImportKind } from '../domain/types';

const KIND_PERMISSION: Record<ImportKind, PermissionKey> = {
  clients: PERMISSIONS.CLIENTS_MANAGE,
  vendors: PERMISSIONS.VENDORS_MANAGE,
  employees: PERMISSIONS.WORKFORCE_MANAGE,
  projects: PERMISSIONS.PROJECTS_CREATE,
  expenses: PERMISSIONS.EXPENSES_CREATE,
};

export function permissionForImportKind(kind: ImportKind): PermissionKey {
  return KIND_PERMISSION[kind];
}

export function assertCanImportKind(context: OrgContext, kind: ImportKind): void {
  assertPermission(context, KIND_PERMISSION[kind]);
}

export function canImportKind(context: OrgContext, kind: ImportKind): boolean {
  return hasPermission(context, KIND_PERMISSION[kind]);
}

export function listImportableKinds(context: OrgContext): EnabledImportKind[] {
  const kinds: EnabledImportKind[] = [];
  if (canImportKind(context, 'clients')) kinds.push('clients');
  if (canImportKind(context, 'vendors')) kinds.push('vendors');
  if (canImportKind(context, 'employees')) kinds.push('employees');
  if (canImportKind(context, 'projects')) kinds.push('projects');
  return kinds;
}

export function assertCanAccessImports(context: OrgContext): void {
  if (listImportableKinds(context).length === 0) {
    throw new AuthorizationError();
  }
}
