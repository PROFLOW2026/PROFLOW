import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { ROLE_TEMPLATE_KEYS, type RoleTemplateKey } from '@/shared/permissions/role-templates';
import type { ApproverStrategy } from './types';

export const APPROVER_STRATEGIES = ['role_template', 'permission', 'user'] as const;

export const APPROVAL_STEP_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** Shared approver config on rule steps and immutable request step snapshots. */
export interface ApprovalStepApproverSnapshot {
  readonly approverStrategy: ApproverStrategy;
  readonly roleTemplateKey: string | null;
  readonly permissionKey: string | null;
  readonly userId: string | null;
}

/**
 * Ensures step orders are unique and exactly 1..n (no gaps or duplicates).
 */
export function assertConsecutiveStepOrders(stepOrders: readonly number[]): void {
  if (stepOrders.length === 0) return;
  const sorted = [...stepOrders].sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) {
    throw new Error('Approval steps have duplicate stepOrder values');
  }
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== index + 1) {
      throw new Error('Approval steps must have consecutive stepOrder values starting at 1');
    }
  }
}

export function isApproverStrategy(value: string): value is ApproverStrategy {
  return (APPROVER_STRATEGIES as readonly string[]).includes(value);
}

export function isRoleTemplateKey(value: string): value is RoleTemplateKey {
  return (ROLE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * Whether the acting user may decide the current step.
 * Legacy single-step (no steps / null currentStepOrder) uses approvals.decide only.
 */
export function canDecideCurrentStep(
  context: OrgContext,
  step: ApprovalStepApproverSnapshot | null,
): boolean {
  if (!step) return true;
  switch (step.approverStrategy) {
    case 'role_template':
      return Boolean(
        step.roleTemplateKey &&
          context.roleKeys.some((key) => key.toLowerCase() === step.roleTemplateKey!.toLowerCase()),
      );
    case 'permission':
      return Boolean(
        step.permissionKey && hasPermission(context, step.permissionKey as PermissionKey),
      );
    case 'user':
      return Boolean(step.userId && step.userId === context.userId);
    default:
      return false;
  }
}

export function entitySourceHref(
  entityType: string,
  entityId: string,
): string | null {
  switch (entityType) {
    case 'expense':
      return `/expenses/${entityId}`;
    case 'vendor_bill':
      return `/procurement/ap/${entityId}`;
    case 'purchase_order':
      return `/procurement/orders/${entityId}`;
    case 'vendor_credit':
      return `/procurement/ap/credits/${entityId}`;
    case 'time_correction':
      return `/workforce/time`;
    case 'quote_discount':
      return `/quotes/${entityId}`;
    case 'budget_revision':
      return `/projects`;
    case 'timesheet':
      return `/workforce/timesheets/${entityId}`;
    default:
      return null;
  }
}
