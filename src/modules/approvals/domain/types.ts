/**
 * Lightweight optional approvals - threshold rules, not a workflow engine.
 * Approvals 2.0 adds ordered steps; 0 steps = legacy single-step decide.
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

export type ApproverStrategy = 'role_template' | 'permission' | 'user';

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected';

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

export interface ApprovalRuleStepRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly stepOrder: number;
  readonly name: string | null;
  readonly approverStrategy: ApproverStrategy;
  readonly roleTemplateKey: string | null;
  readonly permissionKey: string | null;
  readonly userId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApprovalRuleWithSteps extends ApprovalRuleRecord {
  readonly steps: readonly ApprovalRuleStepRecord[];
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
  /** Approvals 2.0: 1-based. Null = legacy single-step. */
  readonly currentStepOrder: number | null;
  readonly totalSteps: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApprovalRequestStepRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly stepOrder: number;
  /** Immutable snapshot copied from the rule step at submit time. */
  readonly name: string | null;
  readonly approverStrategy: ApproverStrategy;
  readonly roleTemplateKey: string | null;
  readonly permissionKey: string | null;
  readonly userId: string | null;
  readonly status: ApprovalStepStatus;
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
  readonly submitterName: string | null;
  readonly currentStepOrder: number | null;
  readonly totalSteps: number | null;
  readonly sourceHref: string | null;
  readonly ageMs: number;
  readonly createdAt: Date;
}
