/**
 * Lightweight optional approvals — threshold rules, not a workflow engine.
 */

export const APPROVAL_ENTITY_TYPES = [
  'expense',
  'vendor_bill',
  'purchase_order',
  'vendor_credit',
  'time_correction',
  'quote_discount',
  'budget_revision',
] as const;

export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const APPROVAL_STATUSES = ['submitted', 'approved', 'rejected', 'cancelled'] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ApprovalRuleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly entityType: ApprovalEntityType;
  readonly thresholdAmount: string | null;
  readonly currency: string | null;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApprovalRequestRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly ruleId: string | null;
  readonly entityType: ApprovalEntityType;
  readonly entityId: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly status: ApprovalStatus;
  readonly submittedByUserId: string | null;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Command Center / inbox projection. */
export interface PendingApprovalItem {
  readonly id: string;
  readonly entityType: ApprovalEntityType;
  readonly entityId: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly status: 'submitted';
  readonly ruleId: string | null;
  readonly submittedByUserId: string | null;
  readonly createdAt: Date;
}
