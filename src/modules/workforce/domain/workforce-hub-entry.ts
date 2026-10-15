import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

/** First workforce hub destination the principal may open, or null when none apply. */
export function resolveWorkforceHubHref(
  hasPermission: (key: PermissionKey) => boolean,
  hasAnyPermission: (keys: readonly PermissionKey[]) => boolean,
): string | null {
  if (hasPermission(PERMISSIONS.WORKFORCE_READ)) return '/workforce/employees';
  if (hasPermission(PERMISSIONS.TIME_MANAGE)) return '/workforce/time';
  if (
    hasAnyPermission([
      PERMISSIONS.ATTENDANCE_SELF,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ])
  ) {
    return '/workforce/attendance';
  }
  return null;
}
