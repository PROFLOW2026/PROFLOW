import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * Employer / business cost authorization (Pre-0021).
 *
 * EMPLOYEE MASTER ≠ COMPENSATION: `workforce.read` never unlocks rates, month
 * costs, or labor allocation runs. Call these before any loader that returns
 * private employer-cost fields.
 */

export function canReadWorkforceCost(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ);
}

export function canManageWorkforceCost(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE);
}

export function assertCanReadWorkforceCost(context: OrgContext): void {
  assertPermission(context, PERMISSIONS.WORKFORCE_COST_READ);
}

export function assertCanManageWorkforceCost(context: OrgContext): void {
  assertPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE);
}
