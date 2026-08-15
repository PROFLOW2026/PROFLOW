import { DomainRuleError } from '@/shared/errors';
import {
  assertAnyPermission,
  assertPermission,
  hasAllPermissions,
  hasPermission,
} from '@/shared/permissions/assert';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findEmployeeByUserId } from '../data/employees.repository';
import type { EmployeeRecord } from '../domain/types';

/** Org-wide roster / time list. Workers with time.manage do not get this. */
export function canReadOrgWorkforce(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_READ);
}

/**
 * Owner template is protected and seeded with every catalog key.
 * Role-name checks are forbidden; "all permissions" is the Owner stand-in.
 */
export function isUnrestrictedOwner(context: OrgContext): boolean {
  return hasAllPermissions(context, ALL_PERMISSION_KEYS);
}

export function canLogTime(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.TIME_MANAGE);
}

export function assertCanListTime(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.TIME_MANAGE, PERMISSIONS.WORKFORCE_READ]);
}

export async function resolveLinkedEmployee(
  context: OrgContext,
): Promise<EmployeeRecord | null> {
  return findEmployeeByUserId(context.db, context.organizationId, context.userId);
}

/**
 * time.manage without workforce.read is self-scoped to the linked employee.
 * Missing link → empty scope (null), not a roster of everyone.
 */
export async function resolveSelfScopedEmployeeId(
  context: OrgContext,
): Promise<string | null> {
  if (canReadOrgWorkforce(context)) return null;
  const linked = await resolveLinkedEmployee(context);
  return linked?.id ?? null;
}

export async function assertCanActOnEmployeeTime(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);
  if (canReadOrgWorkforce(context)) return;

  const linked = await resolveLinkedEmployee(context);
  if (!linked) {
    throw new DomainRuleError(
      'Signed-in user is not linked to an employee',
      'workforce.errors.noLinkedEmployee',
    );
  }
  if (linked.id !== employeeId) {
    throw new DomainRuleError(
      'Time self scope is limited to the linked employee',
      'workforce.errors.timeSelfScope',
    );
  }
}

/**
 * A manager must not approve (or return) the timesheet of their linked employee.
 * Owner / all-permissions is the only exception.
 */
export async function assertNotSelfTimeApproval(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  if (isUnrestrictedOwner(context)) return;
  const linked = await resolveLinkedEmployee(context);
  if (linked && linked.id === employeeId) {
    throw new DomainRuleError(
      'You cannot approve your own timesheet',
      'workforce.errors.selfApprovalBlocked',
    );
  }
}
