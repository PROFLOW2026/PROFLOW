/**
 * Commercial domain types (doc 05). Framework-free — no React, no persistence.
 */

export const CHANGE_REQUEST_STATUSES = [
  'draft',
  'awaiting_approval',
  'approved',
  'rejected',
  'cancelled',
] as const;

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_DIRECTIONS = ['addition', 'reduction'] as const;
export type ChangeDirection = (typeof CHANGE_DIRECTIONS)[number];

export const QUOTE_VERSION_STATUSES = [
  'draft',
  'issued',
  'superseded',
  'accepted',
  'rejected',
] as const;

export type QuoteVersionStatus = (typeof QUOTE_VERSION_STATUSES)[number];

export const APPROVAL_TARGET_TYPES = ['change_request', 'quote_version'] as const;
export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

export const CONTRACT_VALUE_EVENT_KINDS = ['original', 'change_order', 'adjustment'] as const;
export type ContractValueEventKind = (typeof CONTRACT_VALUE_EVENT_KINDS)[number];

export interface ChangeRequestRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly contractId: string | null;
  readonly reference: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: ChangeRequestStatus;
  readonly direction: ChangeDirection;
  readonly requestedAmount: string | null;
  readonly currency: string;
  readonly requestedDate: string | null;
  readonly sentAt: Date | null;
  readonly decidedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdByUserId: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ChangeRequestLineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly changeRequestId: string;
  readonly workPackageId: string | null;
  readonly description: string;
  readonly quantityEntered: string | null;
  readonly unitEntered: string | null;
  readonly unitPrice: string | null;
  readonly lineTotal: string;
  readonly currency: string;
  readonly sortOrder: number;
}

export interface QuoteRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly changeRequestId: string | null;
  readonly title: string | null;
  readonly currency: string;
}

export interface QuoteVersionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly quoteId: string;
  readonly versionNumber: number;
  readonly status: QuoteVersionStatus;
  readonly subtotalAmount: string;
  readonly taxAmount: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly validUntil: string | null;
  readonly issuedAt: Date | null;
  readonly isSelected: boolean;
  readonly notes: string | null;
}

export interface QuoteVersionLineRecord {
  readonly id: string;
  readonly quoteVersionId: string;
  readonly description: string;
  readonly quantityEntered: string | null;
  readonly unitEntered: string | null;
  readonly unitPrice: string | null;
  readonly lineTotal: string;
  readonly currency: string;
  readonly sortOrder: number;
}

export interface ChangeOrderRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly contractId: string;
  readonly changeRequestId: string | null;
  readonly quoteVersionId: string | null;
  readonly approvalId: string | null;
  readonly reference: string | null;
  readonly direction: ChangeDirection;
  readonly amount: string;
  readonly currency: string;
  readonly effectiveDate: string;
  readonly notes: string | null;
}

export interface ContractValueEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly contractId: string;
  readonly projectId: string;
  readonly kind: ContractValueEventKind;
  readonly amount: string;
  readonly currency: string;
  readonly changeOrderId: string | null;
  readonly effectiveDate: string;
}

export interface ContractRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly isPrimary: boolean;
  readonly enteredValueAmount?: string | null;
  readonly amountIncludesTax?: boolean;
  readonly originalValueAmount: string | null;
  readonly originalTaxAmount?: string | null;
  readonly originalGrossAmount?: string | null;
  readonly currency: string;
}

/** Minimal input for pending-change aggregation. */
export interface PendingChangeInput {
  readonly status: ChangeRequestStatus;
  readonly direction: ChangeDirection;
  readonly requestedAmount: string | null;
  readonly currency: string;
  /** Selected issued quote version total, when priced. */
  readonly pricedAmount: string | null;
}

export interface ChangeRequestListItem extends ChangeRequestRecord {
  readonly projectName: string;
  readonly pricedAmount: string | null;
  readonly workPackageNames: readonly string[];
}

export interface ChangeRequestDetail extends ChangeRequestRecord {
  readonly projectName: string;
  readonly lines: readonly ChangeRequestLineRecord[];
  readonly quote: QuoteRecord | null;
  readonly quoteVersions: readonly QuoteVersionRecord[];
  readonly changeOrder: ChangeOrderRecord | null;
}

export const COMMERCIAL_AUDIT_ACTIONS = {
  CHANGE_REQUEST_CREATED: 'change_request.created',
  CHANGE_REQUEST_UPDATED: 'change_request.updated',
  CHANGE_REQUEST_SUBMITTED: 'change_request.submitted',
  CHANGE_REQUEST_SENT: 'change_request.sent',
  CHANGE_REQUEST_REJECTED: 'change_request.rejected',
  CHANGE_REQUEST_CANCELLED: 'change_request.cancelled',
  CHANGE_REQUEST_APPROVED: 'change_request.approved',
  QUOTE_VERSION_CREATED: 'quote_version.created',
  QUOTE_VERSION_ISSUED: 'quote_version.issued',
  CHANGE_ORDER_CREATED: 'change_order.created',
} as const;
