/**
 * Browser-safe copies of the claim enums. The database checks live in
 * `drizzle/schema/dg-claims.ts` and must list the same values.
 */
export const SUBCONTRACT_CLAIM_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'returned',
  'certified',
  'cancelled',
] as const;
export type SubcontractClaimStatus = (typeof SUBCONTRACT_CLAIM_STATUSES)[number];

export const CLAIM_ASSESSMENT_DECISIONS = [
  'certify',
  'reassess',
  'reject_line',
  'return',
  'request_evidence',
] as const;
export type ClaimAssessmentDecision = (typeof CLAIM_ASSESSMENT_DECISIONS)[number];

export const PAYABLE_BASIS_AP_STATUSES = [
  'pending',
  'requested',
  'created',
  'not_required',
  'credit_required',
] as const;
export type PayableBasisApStatus = (typeof PAYABLE_BASIS_AP_STATUSES)[number];

export const DEDUCTION_TYPES = [
  'back_charge',
  'penalty',
  'damage',
  'materials',
  'cleanup',
  'safety',
  'other',
] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export const PAYMENT_HOLD_KINDS = [
  'missing_invoice',
  'missing_tax_document',
  'guarantee',
  'handover_document',
  'insurance',
  'compliance',
  'other',
] as const;
export type PaymentHoldKind = (typeof PAYMENT_HOLD_KINDS)[number];

/** Entity-access / evidence / discussion entity types owned by Track F. */
export const CLAIM_ENTITY = 'claim' as const;
export const CLAIM_LINE_ENTITY = 'claim_line' as const;
export const DEDUCTION_ENTITY = 'deduction' as const;

/** Claim statuses still in progress (at most one per agreement). */
export const OPEN_CLAIM_STATUSES: readonly SubcontractClaimStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'returned',
];

/** Statuses waiting on the project team (Command Center "claims awaiting review"). */
export const AWAITING_REVIEW_STATUSES: readonly SubcontractClaimStatus[] = ['submitted', 'under_review'];

/** Line-level decisions that set the certified amount of a claim line. */
export const LINE_CERTIFYING_DECISIONS: readonly ClaimAssessmentDecision[] = ['certify', 'reassess', 'reject_line'];

export type ClaimActorType = 'internal' | 'external';

/** One decimal string + currency pair for the UI (NET; never formatted on the server for math). */
export interface Amount {
  readonly value: string;
  readonly currency: string;
}

export interface ClaimLineFiguresView {
  readonly contractBaseline: string;
  readonly approvedChanges: string;
  readonly revisedValue: string;
  readonly priorCertified: string;
  readonly currentSubmitted: string;
  readonly cumulativeSubmitted: string;
  readonly currentCertified: string | null;
  readonly cumulativeCertified: string;
  readonly remaining: string;
}

export interface ClaimLineView {
  readonly claimLineId: string;
  readonly workLineId: string;
  readonly code: string | null;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly progressPercent: string | null;
  readonly cumulativeQuantity: string | null;
  readonly note: string | null;
  readonly figures: ClaimLineFiguresView;
  /** As frozen in the submitted revision (null while the revision is a draft). */
  readonly submittedSnapshot: {
    readonly revisedValue: string;
    readonly priorCertified: string;
  } | null;
}

export interface ClaimAssessmentView {
  readonly id: string;
  readonly seq: number;
  readonly revisionNo: number;
  readonly claimLineId: string | null;
  readonly decision: ClaimAssessmentDecision;
  readonly certifiedAmount: string | null;
  readonly reason: string | null;
  readonly assessorName: string | null;
  readonly createdAt: string;
}

export interface ClaimRevisionView {
  readonly id: string;
  readonly revisionNo: number;
  readonly note: string | null;
  readonly submittedAt: string | null;
  readonly submittedBy: ClaimActorType | null;
}

export interface PayableBasisView {
  readonly id: string;
  readonly version: number;
  readonly sourceDecision: 'certify' | 'reassess';
  readonly certifiedTotal: string;
  readonly certifiedDelta: string;
  readonly retentionPercent: string | null;
  readonly retentionAmount: string;
  readonly advanceRecoveryAmount: string;
  readonly deductionsAmount: string;
  readonly payableNet: string;
  readonly apBillStatus: PayableBasisApStatus;
  readonly apBillId: string | null;
  readonly createdAt: string;
}

export interface ClaimHeaderView {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly agreementId: string;
  readonly agreementTitle: string | null;
  readonly claimNumber: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly title: string | null;
  readonly status: SubcontractClaimStatus;
  readonly currentRevisionNo: number;
  readonly currency: string;
  readonly createdActorType: ClaimActorType;
  readonly submittedAt: string | null;
  readonly certifiedAt: string | null;
  readonly lastReassessedAt: string | null;
  readonly createdAt: string;
}

export interface ClaimTotalsView {
  readonly revisedValue: string;
  readonly priorCertified: string;
  readonly currentSubmitted: string;
  readonly cumulativeSubmitted: string;
  readonly currentCertified: string | null;
  readonly cumulativeCertified: string;
  readonly remaining: string;
}

export interface ClaimDetailView {
  readonly header: ClaimHeaderView;
  readonly revisions: readonly ClaimRevisionView[];
  /** Revision whose values are shown (current revision). */
  readonly activeRevisionId: string;
  readonly activeRevisionSubmitted: boolean;
  readonly lines: readonly ClaimLineView[];
  readonly totals: ClaimTotalsView;
  readonly assessments: readonly ClaimAssessmentView[];
  readonly payableBases: readonly PayableBasisView[];
}

export interface ClaimListItem {
  readonly id: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly agreementId: string;
  readonly agreementTitle: string | null;
  readonly claimNumber: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: SubcontractClaimStatus;
  readonly currentRevisionNo: number;
  readonly currency: string;
  readonly submittedAt: string | null;
  readonly certifiedAt: string | null;
  /** Sum of the current revision's claimed amounts (NET). */
  readonly currentSubmitted: string;
  /** Sum of effective certified amounts (NET); null until certified. */
  readonly currentCertified: string | null;
}

export interface DeductionView {
  readonly id: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly agreementId: string;
  readonly claimId: string | null;
  readonly claimNumber: number | null;
  readonly entryKind: 'issue' | 'reversal';
  readonly reversalOfId: string | null;
  readonly reversedById: string | null;
  readonly deductionType: DeductionType;
  readonly amount: string;
  readonly currency: string;
  readonly reason: string;
  readonly contractorVisible: boolean;
  readonly createdAt: string;
  readonly disputes: readonly {
    readonly id: string;
    readonly comment: string;
    readonly actorType: ClaimActorType;
    readonly createdAt: string;
  }[];
}

export interface PaymentHoldView {
  readonly source: 'manual' | 'compliance' | 'invoice';
  readonly kind: PaymentHoldKind;
  readonly holdId: string | null;
  readonly claimId: string | null;
  readonly note: string | null;
  readonly createdAt: string | null;
}
