import type { PermissionKey } from '@/shared/permissions/catalog';

/** Permissions the target role holds that the actor does not. */
export function findEscalatingPermissions(
  actorPermissions: ReadonlySet<PermissionKey>,
  targetPermissions: readonly PermissionKey[],
): PermissionKey[] {
  return targetPermissions.filter((permission) => !actorPermissions.has(permission));
}

export function isPermissionSubset(
  actorPermissions: ReadonlySet<PermissionKey>,
  targetPermissions: readonly PermissionKey[],
): boolean {
  return findEscalatingPermissions(actorPermissions, targetPermissions).length === 0;
}
