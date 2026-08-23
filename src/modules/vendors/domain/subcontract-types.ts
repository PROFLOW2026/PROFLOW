/**
 * Subcontract agreement types. Framework-free.
 *
 * Commitment ≠ expense. Valuation ≠ payment. Current value is derived from
 * append-only value events - never from a pending proposal.
 */

export const SUBCONTRACT_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
export type SubcontractStatus = (typeof SUBCONTRACT_STATUSES)[number];

export const SUBCONTRACT_VALUE_EVENT_KINDS = ['original', 'change_order', 'adjustment'] as const;
export type SubcontractValueEventKind = (typeof SUBCONTRACT_VALUE_EVENT_KINDS)[number];

export const SUBCONTRACT_CHANGE_DIRECTIONS = ['addition', 'reduction'] as const;
export type SubcontractChangeDirection = (typeof SUBCONTRACT_CHANGE_DIRECTIONS)[number];

export const SUBCONTRACT_REQUIRED_DOC_TYPES = ['insurance', 'license', 'contract', 'other'] as const;
export type SubcontractRequiredDocType = (typeof SUBCONTRACT_REQUIRED_DOC_TYPES)[number];

export interface SubcontractAgreementRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly subcontractNumber: string | null;
  readonly vendorId: string;
  readonly projectId: string;
  readonly parentContractId: string | null;
  readonly title: string;
  readonly status: SubcontractStatus;
  readonly originalAmount: string;
  readonly currency: string;
  readonly retentionPercent: string | null;
  /** Org catalog entry (kind=payment_term). */
  readonly paymentTermId: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubcontractValueEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly subcontractId: string;
  readonly kind: SubcontractValueEventKind;
  readonly amount: string;
  readonly currency: string;
  readonly effectiveDate: string;
  readonly reason: string | null;
  readonly actorUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubcontractListItem extends SubcontractAgreementRecord {
  readonly vendorName: string;
  readonly projectName: string;
  readonly currentAmount: string;
  /** Recognized AP Actual tagged to this agreement (not billed/cash). */
  readonly recognizedActualAmount: string;
  /** Current − recognized, net of open PO on same vendor+project. */
  readonly remainingCommitmentAmount: string;
  readonly billedAmount: string;
  readonly paidAmount: string;
  readonly outstandingAmount: string;
}

export interface SubcontractCashPosition {
  readonly billed: string;
  readonly paid: string;
  readonly outstanding: string;
  readonly currency: string;
  /** Cash from existing AP bills. Never Actual. Never posted by this module. */
  readonly note: string;
}

export interface SubcontractLinkedDocument {
  readonly linkId: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly label: string | null;
  readonly isRequired: boolean;
  readonly requiredType: string | null;
  readonly expiresAt: string | null;
}

export interface SubcontractDocumentFlags {
  readonly hasInsurance: boolean;
  readonly insuranceExpiresAt: string | null;
  readonly insuranceExpired: boolean;
  readonly requiredCount: number;
  readonly expiredRequiredCount: number;
}

export interface SubcontractDetail extends SubcontractAgreementRecord {
  readonly vendorName: string;
  readonly projectName: string;
  readonly parentContractLabel: string | null;
  readonly events: readonly SubcontractValueEventRecord[];
  readonly originalAmountDerived: string;
  readonly approvedChangesAmount: string;
  readonly currentAmount: string;
  readonly cash: SubcontractCashPosition;
  readonly documents: readonly SubcontractLinkedDocument[];
  readonly documentFlags: SubcontractDocumentFlags;
}

export interface SubcontractParentContractOption {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
}

export interface SubcontractApBillCashRow {
  readonly status: string;
  readonly totalAmount: string;
  readonly paidAmount: string;
  readonly currency: string;
}
