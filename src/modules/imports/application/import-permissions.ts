import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { EnabledImportKind, ImportKind } from '../domain/types';

const KIND_PERMISSION: Record<ImportKind, PermissionKey> = {
  clients: PERMISSIONS.CLIENTS_MANAGE,
  contacts: PERMISSIONS.CLIENTS_MANAGE,
  vendors: PERMISSIONS.VENDORS_MANAGE,
  employees: PERMISSIONS.WORKFORCE_MANAGE,
  projects: PERMISSIONS.PROJECTS_CREATE,
  opening_values: PERMISSIONS.CONTRACTS_MANAGE,
  cost_categories: PERMISSIONS.SETTINGS_MANAGE,
  expenses: PERMISSIONS.EXPENSES_CREATE,
  boq_items: PERMISSIONS.BOQ_MANAGE,
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
  for (const kind of [
    'clients',
    'contacts',
    'vendors',
    'employees',
    'projects',
    'opening_values',
    'cost_categories',
    'expenses',
    'boq_items',
  ] as const) {
    if (canImportKind(context, kind)) kinds.push(kind);
  }
  return kinds;
}

export function assertCanAccessImports(context: OrgContext): void {
  if (listImportableKinds(context).length === 0) {
    throw new AuthorizationError();
  }
}
