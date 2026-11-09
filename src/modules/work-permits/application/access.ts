import type { OrgContext } from '@/shared/auth/context';
import { assertAnyPermission, assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export function canReadWorkPermits(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.SAFETY_READ) || hasPermission(context, PERMISSIONS.PROJECTS_READ)
  );
}

export function assertWorkPermitRead(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.SAFETY_READ, PERMISSIONS.PROJECTS_READ]);
}

export function canManageWorkPermits(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.SAFETY_MANAGE);
}

export function assertWorkPermitManage(context: OrgContext): void {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
}
