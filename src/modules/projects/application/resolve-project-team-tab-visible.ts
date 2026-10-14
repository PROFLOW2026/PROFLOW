import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/** Team tab visible when workforce roster or project capability members are readable (U05). */
export function resolveProjectTeamTabVisible(
  can: (permission: PermissionKey) => boolean,
): boolean {
  return (
    can(PERMISSIONS.WORKFORCE_READ) ||
    can(PERMISSIONS.PROJECTS_READ)
  );
}
