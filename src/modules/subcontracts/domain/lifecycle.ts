import { DomainRuleError } from '@/shared/errors';
import type {
  AgreementLifecycleAction,
  AgreementLifecycleStatus,
  SubcontractChangeStatus,
  UnpricedWorkStatus,
} from './types';

/**
 * Agreement lifecycle: draft -> active -> suspended <-> active -> completed -> closed.
 * A draft may be cancelled; nothing is ever deleted.
 */
const ACTION_TRANSITIONS: Readonly<
  Record<AgreementLifecycleAction, { readonly from: readonly AgreementLifecycleStatus[]; readonly to: AgreementLifecycleStatus }>
> = {
  activate: { from: ['draft'], to: 'active' },
  suspend: { from: ['active'], to: 'suspended' },
  resume: { from: ['suspended'], to: 'active' },
  complete: { from: ['active', 'suspended'], to: 'completed' },
  close: { from: ['completed'], to: 'closed' },
  cancel: { from: ['draft'], to: 'cancelled' },
};

export function isAgreementLifecycleStatus(value: string): value is AgreementLifecycleStatus {
  return ['draft', 'active', 'suspended', 'completed', 'closed', 'cancelled'].includes(value);
}

export function agreementActionTarget(action: AgreementLifecycleAction): AgreementLifecycleStatus {
  return ACTION_TRANSITIONS[action].to;
}

export function canApplyAgreementAction(
  status: AgreementLifecycleStatus,
  action: AgreementLifecycleAction,
): boolean {
  return ACTION_TRANSITIONS[action].from.includes(status);
}

export function availableAgreementActions(status: AgreementLifecycleStatus): AgreementLifecycleAction[] {
  return (Object.keys(ACTION_TRANSITIONS) as AgreementLifecycleAction[]).filter((action) =>
    canApplyAgreementAction(status, action),
  );
}

export function assertAgreementAction(status: AgreementLifecycleStatus, action: AgreementLifecycleAction): AgreementLifecycleStatus {
  if (!canApplyAgreementAction(status, action)) {
    throw new DomainRuleError(
      `Cannot ${action} a subcontract agreement in status ${status}`,
      'subcontracts.errors.lifecycleTransition',
      { status, action },
    );
  }
  return ACTION_TRANSITIONS[action].to;
}

/** Baseline (lines, quantities, prices, header terms) is editable only before activation. */
export function isBaselineEditable(status: AgreementLifecycleStatus): boolean {
  return status === 'draft';
}

export function assertBaselineEditable(status: AgreementLifecycleStatus): void {
  if (!isBaselineEditable(status)) {
    throw new DomainRuleError(
      'The agreement baseline is locked after activation; use an approved change',
      'subcontracts.errors.baselineLocked',
      { status },
    );
  }
}

/** Changes are raised and decided on running agreements only. */
export function agreementAcceptsChanges(status: AgreementLifecycleStatus): boolean {
  return status === 'active' || status === 'suspended';
}

export function assertAgreementAcceptsChanges(status: AgreementLifecycleStatus): void {
  if (!agreementAcceptsChanges(status)) {
    throw new DomainRuleError(
      'Changes require an active or suspended agreement',
      'subcontracts.errors.changeRequiresRunningAgreement',
      { status },
    );
  }
}

/** Operational line details (dates, location, ordering) stay editable until the agreement is closed. */
export function areLineOperationalDetailsEditable(status: AgreementLifecycleStatus): boolean {
  return status !== 'closed' && status !== 'cancelled';
}

// ── Changes ─────────────────────────────────────────────────────────────────

export type ChangeAction = 'submit' | 'approve' | 'reject' | 'withdraw' | 'propose_version';

const CHANGE_ACTION_FROM: Readonly<Record<ChangeAction, readonly SubcontractChangeStatus[]>> = {
  submit: ['draft'],
  approve: ['submitted', 'under_negotiation'],
  reject: ['submitted', 'under_negotiation'],
  withdraw: ['draft', 'submitted', 'under_negotiation'],
  propose_version: ['draft', 'submitted', 'under_negotiation'],
};

export function isChangeOpen(status: SubcontractChangeStatus): boolean {
  return status === 'draft' || status === 'submitted' || status === 'under_negotiation';
}

export function canApplyChangeAction(status: SubcontractChangeStatus, action: ChangeAction): boolean {
  return CHANGE_ACTION_FROM[action].includes(status);
}

export function assertChangeAction(status: SubcontractChangeStatus, action: ChangeAction): void {
  if (!canApplyChangeAction(status, action)) {
    throw new DomainRuleError(
      `Cannot ${action} a change in status ${status}`,
      'subcontracts.errors.changeTransition',
      { status, action },
    );
  }
}

// ── Unpriced work ───────────────────────────────────────────────────────────

export type UnpricedWorkAction = 'convert' | 'reject' | 'cancel';

export function assertUnpricedWorkAction(status: UnpricedWorkStatus, action: UnpricedWorkAction): void {
  if (status !== 'recorded') {
    throw new DomainRuleError(
      `Cannot ${action} unpriced work in status ${status}`,
      'subcontracts.errors.unpricedTransition',
      { status, action },
    );
  }
}

/** Closing needs every change decided and every unpriced record resolved. */
export function assertAgreementClosable(input: {
  readonly openChanges: number;
  readonly openUnpricedWork: number;
}): void {
  if (input.openChanges > 0 || input.openUnpricedWork > 0) {
    throw new DomainRuleError(
      'Resolve open changes and unpriced work before closing the agreement',
      'subcontracts.errors.closeBlocked',
      { openChanges: input.openChanges, openUnpricedWork: input.openUnpricedWork },
    );
  }
}
