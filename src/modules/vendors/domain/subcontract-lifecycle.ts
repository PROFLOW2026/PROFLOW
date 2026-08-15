import { DomainRuleError } from '@/shared/errors';
import type { SubcontractStatus } from './subcontract-types';

const ALLOWED_TRANSITIONS: Readonly<Record<SubcontractStatus, readonly SubcontractStatus[]>> = {
  draft: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionSubcontractStatus(
  from: SubcontractStatus,
  to: SubcontractStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertSubcontractStatusTransition(
  from: SubcontractStatus,
  to: SubcontractStatus,
): void {
  if (from === to) return;
  if (!canTransitionSubcontractStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot change subcontract status from ${from} to ${to}`,
      'vendors.subcontracts.errors.statusTransition',
      { from, to },
    );
  }
}

export function assertSubcontractAcceptsValueChange(status: SubcontractStatus): void {
  if (status !== 'active') {
    throw new DomainRuleError(
      'Approved subcontract changes require an active agreement',
      'vendors.subcontracts.errors.changeRequiresActive',
      { status },
    );
  }
}

export function assertSubcontractMetadataEditable(status: SubcontractStatus): void {
  if (status === 'cancelled' || status === 'completed') {
    throw new DomainRuleError(
      'Completed or cancelled subcontracts cannot be edited',
      'vendors.subcontracts.errors.notEditable',
      { status },
    );
  }
}

export function assertCanRelinkParties(status: SubcontractStatus): void {
  if (status !== 'draft') {
    throw new DomainRuleError(
      'Vendor, project, and parent contract can only change while the agreement is draft',
      'vendors.subcontracts.errors.partiesLocked',
      { status },
    );
  }
}
