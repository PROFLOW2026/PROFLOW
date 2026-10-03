/**
 * Contractor compliance domain types. Framework-free (no Drizzle, no React).
 */

export const COMPLIANCE_REQUIREMENT_KINDS = [
  'insurance',
  'guarantee',
  'tax_certificate',
  'bookkeeping_certificate',
  'safety_certification',
  'license',
  'custom',
] as const;
export type ComplianceRequirementKind = (typeof COMPLIANCE_REQUIREMENT_KINDS)[number];

/** Requirement status as the business sees it. */
export const COMPLIANCE_STATUSES = ['missing', 'current', 'expiring', 'expired'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_REVIEW_STATUSES = ['pending_review', 'approved', 'rejected'] as const;
export type ComplianceReviewStatus = (typeof COMPLIANCE_REVIEW_STATUSES)[number];

export type ComplianceActorType = 'internal' | 'external' | 'system';

/** Entity-access type for compliance submissions (threads / evidence attach here). */
export const COMPLIANCE_DOCUMENT_ENTITY = 'compliance_document' as const;

export interface ComplianceRequirementRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly title: string;
  readonly description: string | null;
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly requiresExpiry: boolean;
  readonly warningDays: number;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
}

export interface ComplianceDocumentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
  readonly requirementId: string;
  readonly referenceNumber: string | null;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly notes: string | null;
  readonly documentId: string | null;
  readonly complianceArtifactId: string | null;
  readonly submittedActorType: ComplianceActorType;
  readonly submittedByUserId: string | null;
  readonly submittedByPrincipalId: string | null;
  readonly submittedAt: Date;
  readonly reviewStatus: ComplianceReviewStatus;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
}

export interface RequirementStatusResult {
  readonly status: ComplianceStatus;
  /** Approved document that currently defines the status (latest expiry). */
  readonly effectiveDocumentId: string | null;
  readonly expiresOn: string | null;
  /** Days until expiry (negative = days since expiry). null when no expiry applies. */
  readonly daysToExpiry: number | null;
  /** A submission is waiting for internal review. */
  readonly pendingReview: boolean;
  /** The newest submission was rejected (contractor must resubmit). */
  readonly lastRejected: boolean;
}

export interface RequirementWithStatus extends ComplianceRequirementRecord {
  readonly evaluation: RequirementStatusResult;
  readonly documents: readonly ComplianceDocumentRecord[];
}

export interface AgreementComplianceView {
  readonly agreementId: string;
  readonly agreementTitle: string;
  readonly agreementStatus: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly requirements: readonly RequirementWithStatus[];
  readonly counts: Readonly<Record<ComplianceStatus, number>>;
  readonly pendingReviewCount: number;
  /** Required + blocking requirements that are missing or expired. */
  readonly blockingCount: number;
}
