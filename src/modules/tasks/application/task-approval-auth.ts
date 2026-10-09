import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import {
  assertPermission,
  hasPermission,
} from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isUnrestrictedOwner } from '@/modules/workforce/application/time-scope';

/** Task approval submit: domain actors use tasks.update / tasks.manage_all, not approvals.read. */
export function assertCanSubmitTaskApproval(context: OrgContext): void {
  if (
    hasPermission(context, PERMISSIONS.TASKS_UPDATE) ||
    hasPermission(context, PERMISSIONS.TASKS_MANAGE_ALL)
  ) {
    return;
  }
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);
}

/** Task approval decide: tasks.approve or org-wide approvals.decide. */
export function assertCanDecideTaskApproval(context: OrgContext): void {
  if (
    hasPermission(context, PERMISSIONS.TASKS_APPROVE) ||
    hasPermission(context, PERMISSIONS.APPROVALS_DECIDE)
  ) {
    return;
  }
  assertPermission(context, PERMISSIONS.TASKS_APPROVE);
}

/**
 * Submitters must not approve their own task request unless unrestricted Owner.
 * Mirrors workforce timesheet self-approval policy.
 */
export function assertNotSelfTaskApproval(
  context: OrgContext,
  submittedByUserId: string | null,
): void {
  if (!submittedByUserId) return;
  if (isUnrestrictedOwner(context)) return;
  if (submittedByUserId === context.userId) {
    throw new DomainRuleError(
      'You cannot approve your own task submission',
      'tasks.errors.selfApprovalBlocked',
    );
  }
}
