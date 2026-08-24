import type { BusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';

/** Doc 04 §6 - the four V1 cost families. */
export type CostFamily = 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital';

export type ExpenseStatus = 'draft' | 'finalized' | 'void';

export type AllocationTargetType = 'project' | 'overhead';

export type ManualAllocationMethod = 'manual_amount' | 'manual_percent';

export type WeightAllocationMethod =
  | 'contract_weight'
  | 'labor_hours_weight'
  | 'direct_cost_weight'
  | 'equal_split';

export type AllocationMethod = ManualAllocationMethod | WeightAllocationMethod;

export const WEIGHT_ALLOCATION_METHODS: readonly WeightAllocationMethod[] = [
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
] as const;

export function isWeightAllocationMethod(method: AllocationMethod): method is WeightAllocationMethod {
  return (WEIGHT_ALLOCATION_METHODS as readonly string[]).includes(method);
}

/** Whether persisted allocation line amounts are gross (invoice UX) or net (auto engine). */
export type AllocationAmountBasis = 'gross' | 'net';

/** Stored in `recurrence_rule`; V1 records cadence only (doc 04 §12). */
export type RecurrenceCadence = 'one_time' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

/**
 * Category-level period policy for shared/overhead capture.
 * Configured in Settings - never inferred from category key.
 */
export type CategoryPeriodBehavior = 'one_time' | 'monthly' | 'date_range';

export const CATEGORY_PERIOD_BEHAVIORS: readonly CategoryPeriodBehavior[] = [
  'one_time',
  'monthly',
  'date_range',
] as const;

/**
 * How a shared/overhead source NET is split across allocation periods before
 * weight drivers run. Distinct from invoice recurrence (`RecurrenceCadence`).
 */
export type AllocationScheduleMode = 'one_time' | 'monthly' | 'annual' | 'custom';

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
  /** Required for manual_amount; resolved for manual_percent / weight methods. */
  readonly amount?: string | null;
  readonly percent?: string | null;
  readonly notes?: string | null;
  readonly sortOrder: number;
  /** Defaults to gross for manual lines; net for automatic weight runs. */
  readonly amountBasis?: AllocationAmountBasis;
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
  readonly amountBasis: AllocationAmountBasis;
}

/** Per-project weight input for automatic drivers. */
export interface ProjectWeightBasis {
  readonly projectId: string;
  /** Contract NET / labor hours / direct cost NET / 1 for equal_split. */
  readonly basisValue: string;
  readonly basisUnit: 'money' | 'hours' | 'count';
}

export interface AllocationRunExplanation {
  readonly sourceExpenseId?: string;
  readonly method: AllocationMethod;
  readonly amountBasis: AllocationAmountBasis;
  readonly allocatableNet: MoneyValue;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly eligibleProjectIds: readonly string[];
  readonly totalBasis: string;
  readonly basisUnit: 'money' | 'hours' | 'count';
  readonly scheduleMode?: AllocationScheduleMode;
  readonly sliceIndex?: number;
  readonly sourcePeriodStart?: string;
  readonly sourcePeriodEnd?: string;
  readonly sourceNetAmount?: string;
  readonly frozen?: boolean;
  readonly lines: readonly {
    readonly projectId: string;
    readonly basisValue: string;
    readonly percent: string;
    readonly amount: string;
  }[];
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
  readonly netAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly status: ExpenseStatus;
  readonly voidsExpenseId: string | null;
}

export interface ExpenseDetail extends ExpenseSummary {
  readonly phaseId: string | null;
  readonly taxSnapshot: TaxSnapshot | null;
  readonly finalizedAt: BusinessDate | null;
  readonly paymentMethod: string | null;
  readonly notes: string | null;
  readonly adjustsExpenseId: string | null;
  readonly isRecurringTemplate: boolean;
  readonly recurrenceRule: string | null;
  readonly recurringTemplateId: string | null;
  readonly createdByUserId: string | null;
  readonly allocationPeriodStart: BusinessDate | null;
  readonly allocationPeriodEnd: BusinessDate | null;
  readonly allocationDriverMethod: AllocationMethod | null;
  readonly allocationScheduleMode: AllocationScheduleMode | null;
  /** Managerial Actual spread; 1 = full NET in the start month. */
  readonly installmentCount: number;
  readonly installmentStartDate: BusinessDate | null;
  /**
   * When true, finalized NET books to inventory cost basis — not operating Actual.
   */
  readonly inventoryStockPurchase: boolean;
  readonly inventoryItemId: string | null;
  readonly inventoryPurchaseQty: string | null;
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
  readonly defaultAllocationMethod: AllocationMethod | null;
  readonly defaultPeriodBehavior: CategoryPeriodBehavior | null;
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

/** Lightweight vendor pick list for expense capture (doc 07 mode 3). */
export interface VendorOption {
  readonly id: string;
  readonly name: string;
}

/** Lightweight inventory item pick list for stock-purchase expenses. */
export interface InventoryItemOption {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
}
