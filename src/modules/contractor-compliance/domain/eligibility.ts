import { countStatuses, isBlockingStatus } from './status';
import type { ComplianceRequirementKind, ComplianceStatus } from './types';

/**
 * Payment-eligibility INPUTS for Track F (claims / payment holds). Compliance only decides
 * whether its own requirements block; Track F combines this with its other hold reasons.
 * Work certified is independent of payment eligibility (shared contracts §9).
 * No money here.
 */
export interface PaymentEligibilityRequirement {
  readonly requirementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly title: string;
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly status: ComplianceStatus;
  readonly expiresOn: string | null;
  readonly pendingReview: boolean;
  /** True when this requirement currently blocks payment. */
  readonly blocking: boolean;
}

export interface PaymentEligibilityInputs {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly agreementId: string;
  /** Evaluation date (organization timezone), ISO yyyy-mm-dd. */
  readonly asOf: string;
  readonly requirements: readonly PaymentEligibilityRequirement[];
  readonly blockingRequirementIds: readonly string[];
  /** No blocking compliance requirement (eligible from the compliance point of view). */
  readonly compliant: boolean;
  readonly counts: Readonly<Record<ComplianceStatus, number>>;
  readonly pendingReviewCount: number;
}

export interface EligibilityRequirementInput {
  readonly requirementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly title: string;
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly status: ComplianceStatus;
  readonly expiresOn: string | null;
  readonly pendingReview: boolean;
}

export function isRequirementBlocking(input: {
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly status: ComplianceStatus;
}): boolean {
  return input.isRequired && input.blocksPayment && isBlockingStatus(input.status);
}

/** Pure evaluation (Track F may call this with its own loaded data). */
export function evaluatePaymentEligibility(
  scope: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly vendorId: string;
    readonly agreementId: string;
    readonly asOf: string;
  },
  requirements: readonly EligibilityRequirementInput[],
): PaymentEligibilityInputs {
  const evaluated = requirements.map((requirement) => ({
    ...requirement,
    blocking: isRequirementBlocking(requirement),
  }));
  const blockingRequirementIds = evaluated.filter((row) => row.blocking).map((row) => row.requirementId);
  return {
    ...scope,
    requirements: evaluated,
    blockingRequirementIds,
    compliant: blockingRequirementIds.length === 0,
    counts: countStatuses(evaluated.map((row) => row.status)),
    pendingReviewCount: evaluated.filter((row) => row.pendingReview).length,
  };
}
