/**
 * Operational month close - NOT statutory accounting close.
 * Protects operational history from silent rewrite when CLOSED.
 */

export const MONTH_CLOSE_STATUSES = ['open', 'ready', 'closed'] as const;
export type MonthCloseStatus = (typeof MONTH_CLOSE_STATUSES)[number];

export const MONTH_CLOSE_ADJUSTMENT_TYPES = ['correction', 'supersede', 'adjustment'] as const;
export type MonthCloseAdjustmentType = (typeof MONTH_CLOSE_ADJUSTMENT_TYPES)[number];

export const MONTH_CLOSE_EFFECT_SIDES = ['cost', 'revenue'] as const;
export type MonthCloseEffectSide = (typeof MONTH_CLOSE_EFFECT_SIDES)[number];

export interface MonthCloseProjectOption {
  readonly id: string;
  readonly name: string;
}

export const COMPLETENESS_CHECK_KEYS = [
  'missing_employer_cost_actual',
  'unallocated_employee_cost',
  'vendor_bills_unallocated',
  'open_time_corrections',
  'ap_anomalies',
  'missing_project_allocations',
  'unresolved_expense_drafts',
  'incomplete_attendance',
  'open_overhead_allocation',
] as const;

export type CompletenessCheckKey = (typeof COMPLETENESS_CHECK_KEYS)[number];

export interface CompletenessCheckItem {
  readonly key: CompletenessCheckKey;
  readonly applicable: boolean;
  readonly issueCount: number;
  readonly sampleEntityIds: readonly string[];
  /** 100 when clear / N/A; 0 when applicable with issues. */
  readonly scorePercent: number;
}

export interface CompletenessSnapshot {
  readonly yearMonth: string;
  readonly computedAt: string;
  readonly percent: number;
  readonly applicableCount: number;
  readonly passedCount: number;
  readonly items: readonly CompletenessCheckItem[];
}

export interface MonthClosePeriod {
  readonly id: string;
  readonly organizationId: string;
  readonly yearMonth: string;
  readonly status: MonthCloseStatus;
  readonly completenessPercent: string | null;
  readonly completenessSnapshot: CompletenessSnapshot | null;
  readonly closedAt: Date | null;
  readonly closedByUserId: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MonthCloseAdjustment {
  readonly id: string;
  readonly organizationId: string;
  readonly periodId: string;
  readonly adjustmentType: MonthCloseAdjustmentType;
  readonly reason: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  /** Null = audit-only note. When set, currency, effectSide, and projectId are also set. */
  readonly amount: string | null;
  readonly currency: string | null;
  readonly effectSide: MonthCloseEffectSide | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly supersedesAdjustmentId: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
