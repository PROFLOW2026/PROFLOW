import type { BusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';

/** Doc 04 §6 — the four V1 cost families. */
export type CostFamily = 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital';

export type ExpenseStatus = 'draft' | 'finalized' | 'void';

export type AllocationTargetType = 'project' | 'overhead';

export type AllocationMethod = 'manual_amount' | 'manual_percent';

/** Stored in `recurrence_rule`; V1 records cadence only (doc 04 §12). */
export type RecurrenceCadence = 'one_time' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type ExpenseTargetingMode = 'project' | 'overhead';

export interface ExpenseTargeting {
  readonly mode: ExpenseTargetingMode;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly costFamily: CostFamily;
}

export interface AllocationLineInput {
  readonly targetType: AllocationTargetType;
  readonly projectId?: string | null;
  readonly workPackageId?: string | null;
  readonly costCategoryId?: string | null;
  readonly method: AllocationMethod;
  /** Required for manual_amount; resolved for manual_percent. */
  readonly amount?: string | null;
  readonly percent?: string | null;
  readonly notes?: string | null;
  readonly sortOrder: number;
}

export interface ResolvedAllocationLine {
  readonly targetType: AllocationTargetType;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly costCategoryId: string | null;
  readonly method: AllocationMethod;
  readonly amount: MoneyValue;
  readonly percent: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface TaxSnapshot {
  readonly netAmount: string;
  readonly taxAmount: string | null;
  readonly grossAmount: string;
  readonly currency: string;
  readonly capturedAt: string;
}

export interface ExpenseSummary {
  readonly id: string;
  readonly expenseDate: BusinessDate;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly workPackageId: string | null;
  readonly costFamily: CostFamily;
  readonly costCategoryId: string | null;
  readonly grossAmount: MoneyValue;
  readonly status: ExpenseStatus;
  readonly voidsExpenseId: string | null;
}

export interface ExpenseDetail extends ExpenseSummary {
  readonly phaseId: string | null;
  readonly netAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly taxSnapshot: TaxSnapshot | null;
  readonly finalizedAt: BusinessDate | null;
  readonly paymentMethod: string | null;
  readonly notes: string | null;
  readonly adjustsExpenseId: string | null;
  readonly isRecurringTemplate: boolean;
  readonly recurrenceRule: string | null;
  readonly recurringTemplateId: string | null;
  readonly createdByUserId: string | null;
  readonly allocations: readonly ResolvedAllocationLine[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CostCategoryRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly family: CostFamily;
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

export interface ProjectOption {
  readonly id: string;
  readonly name: string;
  readonly currency: string | null;
}

export interface WorkPackageOption {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly isDefault: boolean;
}
