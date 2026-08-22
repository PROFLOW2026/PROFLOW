/**
 * Billing plan / cycle status transitions.
 *
 * Submitted and approved cycles stay editable until linked AR is fully paid.
 * Void is never editable. Fully paid blocks normal edits.
 */

import { DomainRuleError } from '@/shared/errors';
import { compareMoney, money, type MoneyValue } from '@/shared/money';
import type { BillingCycleStatus, BillingPlanStatus } from './types';

const PLAN_TRANSITIONS: Readonly<Record<BillingPlanStatus, readonly BillingPlanStatus[]>> = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

const CYCLE_TRANSITIONS: Readonly<Record<BillingCycleStatus, readonly BillingCycleStatus[]>> = {
  draft: ['ready', 'submitted', 'void'],
  ready: ['draft', 'submitted', 'void'],
  submitted: ['partially_approved', 'approved', 'void'],
  partially_approved: ['approved', 'submitted', 'void'],
  approved: ['submitted', 'void'],
  void: [],
};

const EDITABLE_CYCLE_STATUSES: ReadonlySet<BillingCycleStatus> = new Set([
  'draft',
  'ready',
  'submitted',
  'partially_approved',
  'approved',
]);

export function canTransitionPlanStatus(from: BillingPlanStatus, to: BillingPlanStatus): boolean {
  if (from === to) return false;
  return PLAN_TRANSITIONS[from].includes(to);
}

export function assertCanTransitionPlanStatus(from: BillingPlanStatus, to: BillingPlanStatus): void {
  if (!canTransitionPlanStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition billing plan from ${from} to ${to}`,
      'billingPlan.errors.invalidPlanTransition',
      { from, to },
    );
  }
}

export function canTransitionCycleStatus(
  from: BillingCycleStatus,
  to: BillingCycleStatus,
): boolean {
  if (from === to) return false;
  return CYCLE_TRANSITIONS[from].includes(to);
}

export function assertCanTransitionCycleStatus(
  from: BillingCycleStatus,
  to: BillingCycleStatus,
): void {
  if (!canTransitionCycleStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition billing cycle from ${from} to ${to}`,
      'billingPlan.errors.invalidCycleTransition',
      { from, to },
    );
  }
}

export function isPlanEditable(status: BillingPlanStatus): boolean {
  return status === 'draft' || status === 'active';
}

export function assertPlanEditable(status: BillingPlanStatus): void {
  if (!isPlanEditable(status)) {
    throw new DomainRuleError(
      'Only draft or active billing plans can be edited',
      'billingPlan.errors.planNotEditable',
      { status },
    );
  }
}

export function canActivatePlan(status: BillingPlanStatus): boolean {
  return status === 'draft';
}

/** Submit replaces the former issue gate (draft/ready → submitted). */
export function canSubmitCycle(status: BillingCycleStatus): boolean {
  return status === 'draft' || status === 'ready';
}

export function assertCanSubmitCycle(status: BillingCycleStatus): void {
  if (!canSubmitCycle(status)) {
    throw new DomainRuleError(
      'Only draft or ready cycles can be submitted',
      'billingPlan.errors.cycleNotSubmittable',
      { status },
    );
  }
}

/** @deprecated Prefer canSubmitCycle — submit replaces issue. */
export const canIssueCycle = canSubmitCycle;
/** @deprecated Prefer assertCanSubmitCycle. */
export const assertCanIssueCycle = assertCanSubmitCycle;

export function canApproveCycle(status: BillingCycleStatus): boolean {
  return status === 'submitted' || status === 'partially_approved';
}

export function assertCanApproveCycle(status: BillingCycleStatus): void {
  if (!canApproveCycle(status)) {
    throw new DomainRuleError(
      'Only submitted or partially approved cycles can be approved',
      'billingPlan.errors.cycleNotApprovable',
      { status },
    );
  }
}

export interface CycleEditableInput {
  readonly status: BillingCycleStatus;
  readonly fullyPaid: boolean;
  readonly paidAmount: string | MoneyValue;
  readonly approvedTotal: string | MoneyValue;
  readonly currency: string;
}

/**
 * Normal-edit eligibility: void never; fully paid never; otherwise
 * draft | ready | submitted | partially_approved | approved.
 */
export function isCycleEditable(input: CycleEditableInput): boolean {
  if (input.status === 'void') return false;
  if (input.fullyPaid) return false;
  return EDITABLE_CYCLE_STATUSES.has(input.status);
}

export function assertCycleEditable(input: CycleEditableInput): void {
  if (input.status === 'void') {
    throw new DomainRuleError(
      'Void cycles cannot be edited',
      'billingPlan.errors.cycleNotEditable',
      { status: input.status },
    );
  }
  if (input.fullyPaid) {
    throw new DomainRuleError(
      'Fully paid cycles cannot be edited',
      'billingPlan.errors.cycleFullyPaidLocked',
      { status: input.status },
    );
  }
  if (!EDITABLE_CYCLE_STATUSES.has(input.status)) {
    throw new DomainRuleError(
      'This cycle status cannot be edited',
      'billingPlan.errors.cycleNotEditable',
      { status: input.status },
    );
  }
}

/**
 * Partial payment guard: approved/payable total must not fall below paidAmount.
 */
export function assertCannotReduceBelowPaid(input: {
  readonly paidAmount: string | MoneyValue;
  readonly approvedTotal: string | MoneyValue;
  readonly currency: string;
}): void {
  const paid =
    typeof input.paidAmount === 'string'
      ? money(input.paidAmount, input.currency)
      : input.paidAmount;
  const approved =
    typeof input.approvedTotal === 'string'
      ? money(input.approvedTotal, input.currency)
      : input.approvedTotal;
  if (compareMoney(approved, paid) < 0) {
    throw new DomainRuleError(
      'Cannot reduce approved/payable amount below paid amount',
      'billingPlan.errors.cannotReduceBelowPaid',
      {
        paidAmount: typeof input.paidAmount === 'string' ? input.paidAmount : paid.amount,
        approvedTotal: typeof input.approvedTotal === 'string' ? input.approvedTotal : approved.amount,
      },
    );
  }
}

/** @deprecated Use assertCycleEditable with payment context. */
export function isCycleLinesMutable(status: BillingCycleStatus): boolean {
  return status === 'draft' || status === 'ready';
}

/** @deprecated Use assertCycleEditable. */
export function assertCycleLinesMutable(status: BillingCycleStatus): void {
  assertCycleEditable({
    status,
    fullyPaid: false,
    paidAmount: '0',
    approvedTotal: '0',
    currency: 'ILS',
  });
  if (status === 'void') {
    throw new DomainRuleError(
      'Cycle lines are not editable',
      'billingPlan.errors.cycleLinesImmutable',
      { status },
    );
  }
}

export function isPlanActive(status: BillingPlanStatus): boolean {
  return status === 'active';
}

export function assertPlanActiveForCycle(status: BillingPlanStatus): void {
  if (!isPlanActive(status)) {
    throw new DomainRuleError(
      'Cycles can only be created or submitted on an active plan',
      'billingPlan.errors.planNotActive',
      { status },
    );
  }
}

export function assertBoqNodeNotAlreadyBilled(alreadyBilled: boolean): void {
  if (alreadyBilled) {
    throw new DomainRuleError(
      'BOQ node already billed via progress billing',
      'billingPlan.errors.boqAlreadyBilled',
    );
  }
}

/** Derive partially_approved vs approved from line requested vs approved amounts. */
export function resolveApprovalStatus(input: {
  readonly currency: string;
  readonly lines: readonly {
    readonly requestedAmount: string | null;
    readonly approvedAmount: string | null;
  }[];
}): 'partially_approved' | 'approved' {
  let anyPartial = false;
  let anyApproved = false;
  for (const line of input.lines) {
    if (line.approvedAmount == null) {
      anyPartial = true;
      continue;
    }
    anyApproved = true;
    const requested = money(line.requestedAmount ?? '0', input.currency);
    const approved = money(line.approvedAmount, input.currency);
    if (compareMoney(approved, requested) < 0) {
      anyPartial = true;
    }
  }
  if (!anyApproved) return 'partially_approved';
  return anyPartial ? 'partially_approved' : 'approved';
}
