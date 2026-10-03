import { DomainRuleError } from '@/shared/errors';
import type { ClaimActorType, SubcontractClaimStatus } from './types';

/**
 * Claim header state machine (mirrors `app.subcontract_claims_guard_update` in 0159).
 *
 *   draft -> submitted -> under_review -> certified
 *                \-> returned -> draft (new revision) -> submitted ...
 *   draft / returned -> cancelled
 *
 * Reassessment keeps a certified claim certified (the decision is appended, the status does not move).
 */
const TRANSITIONS: Readonly<Record<SubcontractClaimStatus, readonly SubcontractClaimStatus[]>> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'returned', 'certified'],
  under_review: ['returned', 'certified'],
  returned: ['draft', 'cancelled'],
  certified: [],
  cancelled: [],
};

const EXTERNAL_TRANSITIONS: Readonly<Record<SubcontractClaimStatus, readonly SubcontractClaimStatus[]>> = {
  draft: ['submitted', 'cancelled'],
  submitted: [],
  under_review: [],
  returned: ['draft'],
  certified: [],
  cancelled: [],
};

export function canTransition(
  from: SubcontractClaimStatus,
  to: SubcontractClaimStatus,
  actor: ClaimActorType,
): boolean {
  const table = actor === 'external' ? EXTERNAL_TRANSITIONS : TRANSITIONS;
  return table[from].includes(to);
}

export function assertTransition(
  from: SubcontractClaimStatus,
  to: SubcontractClaimStatus,
  actor: ClaimActorType,
): void {
  if (!canTransition(from, to, actor)) {
    throw new DomainRuleError(
      `Claim cannot move from ${from} to ${to}`,
      'subcontractClaims.errors.invalidTransition',
      { from, to },
    );
  }
}

/** Lines and the period are editable only while the current revision is a draft. */
export function isEditableStatus(status: SubcontractClaimStatus): boolean {
  return status === 'draft';
}

/** Review decisions (certify / return / request evidence) apply to a submitted claim. */
export function isReviewableStatus(status: SubcontractClaimStatus): boolean {
  return status === 'submitted' || status === 'under_review';
}

export function assertReviewable(status: SubcontractClaimStatus): void {
  if (!isReviewableStatus(status)) {
    throw new DomainRuleError('Claim is not awaiting review', 'subcontractClaims.errors.notReviewable', {
      status,
    });
  }
}

export function assertCertified(status: SubcontractClaimStatus): void {
  if (status !== 'certified') {
    throw new DomainRuleError(
      'Only a certified claim can be reassessed',
      'subcontractClaims.errors.notCertified',
      { status },
    );
  }
}

/** Agreement statuses that accept progress claims. */
export function assertAgreementClaimable(agreementStatus: string): void {
  if (agreementStatus !== 'active' && agreementStatus !== 'completed') {
    throw new DomainRuleError(
      'Claims can only be made on an active agreement',
      'subcontractClaims.errors.agreementNotClaimable',
      { status: agreementStatus },
    );
  }
}

export function assertPeriod(periodStart: string, periodEnd: string): void {
  if (periodEnd < periodStart) {
    throw new DomainRuleError('Period end is before its start', 'subcontractClaims.errors.periodOrder');
  }
}
