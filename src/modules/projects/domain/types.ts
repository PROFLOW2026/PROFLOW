/**
 * Projects domain types. Framework-free — no React, no Next.js, no persistence.
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
  readonly status: ProjectStatus;
  readonly clientId: string | null;
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

export interface ContractRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly isPrimary: boolean;
  readonly name: string | null;
  readonly reference: string | null;
  readonly status: string;
  /** User-entered amount before applying VAT mode. */
  readonly enteredValueAmount: string | null;
  readonly amountIncludesTax: boolean;
  /** Net commercial original value (profitability / CCV basis). */
  readonly originalValueAmount: string | null;
  readonly originalTaxAmount: string | null;
  readonly originalGrossAmount: string | null;
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
}
