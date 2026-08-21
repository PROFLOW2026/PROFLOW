/**
 * Projects domain types. Framework-free - no React, no Next.js, no persistence.
 */

export const PROJECT_STATUSES = [
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** UX mode on the shared `projects` row (financial engine is identical). */
export const WORK_KINDS = ['project', 'job', 'work_order'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/** Job / work-order pricing UX (fixed | open); classic projects use null. */
export function usesJobStylePricing(workKind: WorkKind | string | null | undefined): boolean {
  return workKind === 'job' || workKind === 'work_order';
}

/**
 * Revenue pricing mode. Jobs require `fixed` or `open`. Classic projects use
 * null (treated as fixed once a managed contract exists).
 */
export const PRICING_MODES = ['fixed', 'open'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const PROGRESS_STATUSES = [
  'not_started',
  'on_track',
  'at_risk',
  'delayed',
  'completed',
] as const;

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export const MILESTONE_STATUSES = ['planned', 'achieved', 'missed', 'cancelled'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Internal canonical name for the auto-created package (doc 39 §2). */
export const DEFAULT_WORK_PACKAGE_NAME = 'General';

export interface ProjectRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  /** Internal tracking number (PRJ-/JOB-/WO-). Null on rows created before numbering. */
  readonly documentNumber: string | null;
  readonly status: ProjectStatus;
  readonly workKind: WorkKind;
  /**
   * Optional experience profile overlay. Null = derive at runtime.
   * Known values: simple | full | boq | consulting | service_installation | small_job.
   */
  readonly experienceProfile: string | null;
  readonly pricingMode: PricingMode | null;
  readonly clientId: string | null;
  /** Optional project-specific contact (client_contacts). Does not mutate client-wide primary. */
  readonly primaryContactId: string | null;
  readonly currency: string | null;
  readonly description: string | null;
  readonly location: string | null;
  readonly projectRole: string | null;
  readonly deliveryMode: string | null;
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly actualEndDate: string | null;
  readonly progressPercent: string | null;
  readonly progressStatus: ProgressStatus | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkPackageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly sortOrder: number;
  readonly description: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly progressPercent: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PhaseRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string;
  readonly name: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MilestoneRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly name: string;
  readonly targetDate: string | null;
  readonly completedAt: string | null;
  readonly status: MilestoneStatus;
  readonly sortOrder: number;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContractTaxSnapshotRecord {
  readonly enteredAmount: string;
  readonly amountIncludesTax: boolean;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly ratePercent: string | null;
  readonly method: string | null;
  readonly ruleId: string | null;
  readonly ruleKey: string | null;
  readonly ruleName: string | null;
  readonly capturedAt: string;
}

/** UX kind. `isPrimary` remains the unique commercial primary per project. */
export const CONTRACT_TYPES = ['primary', 'additional', 'secondary'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ['draft', 'active', 'closed', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly isPrimary: boolean;
  readonly contractType: ContractType;
  readonly contractNumber: string | null;
  readonly clientId: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly retentionPercent: string | null;
  /** Org catalog entry (kind=payment_term). */
  readonly paymentTermId: string | null;
  readonly name: string | null;
  readonly reference: string | null;
  readonly status: string;
  /**
   * Managed-opening entered amount (after tax mode). When an opening reduction
   * exists this is the managed figure, not the real-world display original.
   */
  readonly enteredValueAmount: string | null;
  readonly amountIncludesTax: boolean;
  /** Managed opening NET - profitability / CCV basis (not display original). */
  readonly originalValueAmount: string | null;
  readonly originalTaxAmount: string | null;
  readonly originalGrossAmount: string | null;
  /** Real-world original (context). Null ⇒ equals managed opening. */
  readonly displayOriginalEnteredAmount: string | null;
  readonly displayOriginalNetAmount: string | null;
  readonly displayOriginalTaxAmount: string | null;
  readonly displayOriginalGrossAmount: string | null;
  /** Already-behind portion before ProjectFlow; not a payment/bill/expense. */
  readonly openingReductionEnteredAmount: string | null;
  readonly openingReductionNetAmount: string | null;
  readonly openingReductionTaxAmount: string | null;
  readonly openingReductionGrossAmount: string | null;
  readonly taxSnapshot: ContractTaxSnapshotRecord | null;
  readonly currency: string;
  readonly signedDate: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContractValueEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly contractId: string;
  readonly projectId: string;
  readonly kind: string;
  readonly amount: string;
  readonly currency: string;
  readonly changeOrderId: string | null;
  readonly effectiveDate: string;
  readonly reason: string | null;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorEmail: string | null;
  readonly createdAt: Date;
}

export type ProjectSortField = 'name' | 'status' | 'created_at' | 'updated_at';
export type SortDirection = 'asc' | 'desc';

export interface ProjectListFilters {
  readonly search?: string;
  readonly status?: ProjectStatus | 'all';
  readonly clientId?: string;
  /** When set, restricts to that work kind; omit to include both. */
  readonly workKind?: WorkKind;
  /**
   * Derived financial filter: outstanding billing (invoiced − paid) > 0.
   * Not a `project_status` value.
   */
  readonly awaitingPayment?: boolean;
  readonly includeArchived?: boolean;
  readonly sortBy?: ProjectSortField;
  readonly sortDirection?: SortDirection;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ProjectListItem extends ProjectRecord {
  readonly clientName: string | null;
  readonly workPackageCount: number;
  readonly currentContractValue: string | null;
  readonly contractCurrency: string | null;
  /** Manual forecast remaining (jobs list / batch financials). */
  readonly expectedRemainingCostAmount: string | null;
}

/** Billing/payment rollup for job list rows (coarse UI status). */
export type JobBillingPaymentStatus = 'none' | 'unpaid' | 'partial' | 'paid';

export interface JobListItem extends ProjectListItem {
  readonly actualCostAmount: string | null;
  readonly profitAmount: string | null;
  /** False when open-price / no revenue basis - UI must not invent a margin. */
  readonly profitDefined: boolean;
  readonly billingPaymentStatus: JobBillingPaymentStatus;
  readonly invoicedAmount: string | null;
  readonly paidAmount: string | null;
}
