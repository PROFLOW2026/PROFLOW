/**
 * Project Billing Plans / Progress Accounts — domain types.
 *
 * Billing plans schedule AR billing_records. Issuing a cycle creates billing only —
 * never a payment.
 */

import { AUDIT_ACTIONS } from '@/shared/audit/actions';

export type BillingPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

export type BillingCycleStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'partially_approved'
  | 'approved'
  | 'void';

export type BillingCycleDocumentKind =
  | 'progress_account'
  | 'partial_account'
  | 'payment_request';

export type BillingPlanLineKind =
  | 'fixed_amount'
  | 'percent_of_contract'
  | 'percent_of_base'
  | 'milestone'
  | 'period'
  | 'boq_link'
  | 'manual';

export type BillingPlanWorkKind =
  | 'contractor'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'renovation'
  | 'small_works'
  | 'service_install'
  | 'architecture'
  | 'design'
  | 'engineering'
  | 'consulting'
  | 'inspection'
  | 'maintenance'
  | 'mixed';

export interface BillingPlanTemplateRowDefinition {
  readonly labelKey: string;
  /** Fallback display when i18n is unavailable (prefer labelKey). */
  readonly labelFallback?: string;
  readonly lineKind: BillingPlanLineKind;
  readonly agreedPercent?: string | null;
  readonly agreedAmount?: string | null;
  readonly sortOrder: number;
  readonly sectionKey?: string | null;
  readonly sectionLabelKey?: string | null;
}

export interface BillingPlanTemplateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string | null;
  readonly workKind: BillingPlanWorkKind | null;
  readonly defaultRetentionPercent: string | null;
  readonly currency: string | null;
  readonly rowsJson: readonly BillingPlanTemplateRowDefinition[];
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingPlanRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly contractId: string;
  readonly templateId: string | null;
  readonly name: string;
  readonly status: BillingPlanStatus;
  readonly currency: string;
  readonly defaultRetentionPercent: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly activatedAt: Date | null;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingPlanSectionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingPlanLineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly sectionId: string | null;
  readonly sortOrder: number;
  readonly label: string;
  readonly lineKind: BillingPlanLineKind;
  readonly agreedAmount: string;
  readonly agreedPercent: string | null;
  readonly targetDate: string | null;
  readonly milestoneLabel: string | null;
  readonly retentionPercentOverride: string | null;
  readonly boqNodeId: string | null;
  readonly notes: string | null;
  readonly isArchived: boolean;
  /** Frozen on first issued cycle line; never rewritten. */
  readonly agreedAmountSnapshot: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingCycleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly projectId: string;
  readonly contractId: string;
  readonly cycleNumber: number;
  readonly title: string;
  readonly documentKind: BillingCycleDocumentKind;
  readonly status: BillingCycleStatus;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly accountDate: string;
  readonly retentionPercent: string | null;
  readonly notes: string | null;
  readonly billingRecordId: string | null;
  /** @deprecated Prefer submittedAt — kept while callers migrate. */
  readonly issuedAt: Date | null;
  /** @deprecated Prefer submittedByUserId. */
  readonly issuedByUserId: string | null;
  readonly submittedAt: Date | null;
  readonly submittedByUserId: string | null;
  readonly revisionNumber: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingCycleLineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly cycleId: string;
  readonly planLineId: string;
  readonly sortOrder: number;
  /** Working requested values (editable draft / post-submit corrections). */
  readonly currentPercent: string | null;
  readonly currentAmount: string | null;
  /** Snapshot of last submitted request. */
  readonly requestedPercent: string | null;
  readonly requestedAmount: string | null;
  /** Customer-approved slice; null until approval. */
  readonly approvedPercent: string | null;
  readonly approvedAmount: string | null;
  readonly priorPercent: string;
  readonly priorAmount: string;
  readonly cumulativePercent: string;
  readonly cumulativeAmount: string;
  readonly remainingAmount: string;
  readonly baseAmountSnapshot: string;
  readonly retentionAmount: string;
  readonly lineNotes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectBillingCycleRevisionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly cycleId: string;
  readonly revisionNumber: number;
  readonly status: BillingCycleStatus;
  readonly snapshotJson: unknown;
  readonly changeSummary: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export interface PlanLineProgress {
  readonly planLineId: string;
  readonly agreedAmount: string;
  readonly billedAmount: string;
  readonly remainingAmount: string;
  readonly billedPercent: string;
}

export interface PlanReconciliation {
  readonly currency: string;
  readonly contractValue: string;
  readonly plannedTotal: string;
  readonly billedTotal: string;
  readonly unplannedAmount: string;
  readonly remainingPlanned: string;
  readonly overPlanned: boolean;
  readonly lines: readonly PlanLineProgress[];
}

/** Convenience aliases mapped to the shared audit catalog. */
export const BILLING_PLAN_AUDIT_ACTIONS = {
  PLAN_CREATED: AUDIT_ACTIONS.BILLING_PLAN_CREATED,
  PLAN_UPDATED: AUDIT_ACTIONS.BILLING_PLAN_UPDATED,
  PLAN_ACTIVATED: AUDIT_ACTIONS.BILLING_PLAN_ACTIVATED,
  PLAN_COMPLETED: AUDIT_ACTIONS.BILLING_PLAN_COMPLETED,
  PLAN_ARCHIVED: AUDIT_ACTIONS.BILLING_PLAN_ARCHIVED,
  LINES_CHANGED: AUDIT_ACTIONS.BILLING_PLAN_LINES_CHANGED,
  CYCLE_CREATED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_CREATED,
  CYCLE_UPDATED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_UPDATED,
  CYCLE_ISSUED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_ISSUED,
  CYCLE_SUBMITTED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_ISSUED,
  CYCLE_APPROVED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_UPDATED,
  CYCLE_VOIDED: AUDIT_ACTIONS.BILLING_PLAN_CYCLE_VOIDED,
  TEMPLATE_APPLIED: AUDIT_ACTIONS.BILLING_PLAN_TEMPLATE_APPLIED,
  TEMPLATE_SAVED: AUDIT_ACTIONS.BILLING_PLAN_TEMPLATE_SAVED,
} as const;
