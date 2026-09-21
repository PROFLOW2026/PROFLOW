import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { employeeHasPermission } from './load-employee-app-context';

export type OrgListSurface = 'owner' | 'employee';

export function orgListHasPermission(
  context: OrgContext,
  permission: PermissionKey,
  surface: OrgListSurface,
): boolean {
  return surface === 'employee'
    ? employeeHasPermission(context, permission)
    : hasPermission(context, permission);
}
