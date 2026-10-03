import { DomainRuleError } from '@/shared/errors';
import type { ComplianceReviewStatus } from './types';

export function assertSubmissionDates(input: {
  readonly requiresExpiry: boolean;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
}): void {
  if (input.requiresExpiry && !input.expiresOn) {
    throw new DomainRuleError('Expiry date is required for this requirement', 'contractorCompliance.errors.expiryRequired');
  }
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
    throw new DomainRuleError('Expiry date is before issue date', 'contractorCompliance.errors.expiryBeforeIssue');
  }
}

export function assertRequirementOpen(requirement: { readonly archivedAt: Date | null }): void {
  if (requirement.archivedAt) {
    throw new DomainRuleError('Requirement is archived', 'contractorCompliance.errors.requirementArchived');
  }
}

export interface ReviewDecisionInput {
  readonly currentStatus: ComplianceReviewStatus;
  readonly decision: 'approved' | 'rejected';
  readonly note: string | null;
  /** Linked document, reused compliance artifact, or uploaded evidence files. */
  readonly evidenceCount: number;
}

/** A review is final; approval needs evidence; rejection needs a reason the contractor can act on. */
export function assertReviewDecision(input: ReviewDecisionInput): void {
  if (input.currentStatus !== 'pending_review') {
    throw new DomainRuleError('Submission was already reviewed', 'contractorCompliance.errors.alreadyReviewed');
  }
  if (input.decision === 'approved' && input.evidenceCount <= 0) {
    throw new DomainRuleError('Approval requires an attached document', 'contractorCompliance.errors.evidenceRequired');
  }
  if (input.decision === 'rejected' && !(input.note ?? '').trim()) {
    throw new DomainRuleError('Rejection requires a reason', 'contractorCompliance.errors.rejectionReasonRequired');
  }
}
