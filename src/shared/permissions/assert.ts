import { AuthorizationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import type { PermissionKey } from './catalog';

/**
 * The only authorization gate in the product (doc 73 §1).
 *
 * There is no role-name comparison anywhere in the codebase; a lint rule blocks
 * reintroducing one. Hiding a control in the UI is a courtesy — these
 * assertions are the actual protection and must run on every mutation and every
 * financial read.
 */

export function hasPermission(context: OrgContext, permission: PermissionKey): boolean {
  return context.permissions.has(permission);
}

export function hasAnyPermission(context: OrgContext, permissions: readonly PermissionKey[]): boolean {
  return permissions.some((permission) => context.permissions.has(permission));
}

export function hasAllPermissions(context: OrgContext, permissions: readonly PermissionKey[]): boolean {
  return permissions.every((permission) => context.permissions.has(permission));
}

export function assertPermission(context: OrgContext, permission: PermissionKey): void {
  if (!hasPermission(context, permission)) throw new AuthorizationError(permission);
}

export function assertAnyPermission(context: OrgContext, permissions: readonly PermissionKey[]): void {
  if (!hasAnyPermission(context, permissions)) throw new AuthorizationError(permissions.join(' | '));
}

export function assertAllPermissions(context: OrgContext, permissions: readonly PermissionKey[]): void {
  for (const permission of permissions) assertPermission(context, permission);
}

/**
 * Guards a cross-tenant reference supplied by the client. Any identifier that
 * arrived in a form body must pass through a tenant-scoped lookup before use;
 * this catches the case where the row was fetched without an org filter.
 */
export function assertSameOrganization(
  context: OrgContext,
  record: { organizationId: string } | null | undefined,
  resourceName: string,
): void {
  if (!record || record.organizationId !== context.organizationId) {
    // Reported as "not found" so probing cannot confirm the row exists.
    throw new AuthorizationError(`${resourceName} is outside the active organization`);
  }
}
