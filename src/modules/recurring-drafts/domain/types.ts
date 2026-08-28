import type { BusinessDate } from '@/shared/dates';
import type { ExpenseVatMode } from '@/modules/expenses/domain/vat-mode';

export const DRAFT_KINDS = ['expense', 'vendor_bill', 'billing_record'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type DraftFrequency = (typeof DRAFT_FREQUENCIES)[number];

export const DRAFT_STATUSES = ['active', 'paused', 'ended'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export function isDraftKind(value: string): value is DraftKind {
  return (DRAFT_KINDS as readonly string[]).includes(value);
}

export function isDraftFrequency(value: string): value is DraftFrequency {
  return (DRAFT_FREQUENCIES as readonly string[]).includes(value);
}

export function isDraftStatus(value: string): value is DraftStatus {
  return (DRAFT_STATUSES as readonly string[]).includes(value);
}

export type ManagerialCostKind = 'direct_project' | 'general_business';

export interface RecurringFinancialDraftRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly draftKind: DraftKind;
  readonly title: string;
  readonly frequency: DraftFrequency;
  readonly intervalCount: number;
  readonly nextRunDate: BusinessDate;
  readonly endDate: BusinessDate | null;
  readonly payloadJson: unknown;
  readonly status: DraftStatus;
  readonly lastGeneratedAt: Date | null;
  /** When true and draftKind=expense, finalize after create if month is open. */
  readonly autoFinalizeExpense: boolean;
  /** Owner attribution for generated expenses (0069). */
  readonly managerialCostKind: ManagerialCostKind | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecurringFinancialDraftRunRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly draftId: string;
  readonly runDate: BusinessDate;
  /** YYYY-MM for monthly occurrence idempotency (null for non-monthly). */
  readonly occurrenceYearMonth: string | null;
  readonly generatedEntityType: DraftKind;
  readonly generatedEntityId: string;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface RecurringDraftAmountVersionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly draftId: string;
  readonly amount: string;
  readonly currency: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecurringDraftListFilters {
  readonly kind?: DraftKind;
  readonly status?: DraftStatus;
  readonly includeEnded?: boolean;
}

export type ExpenseDraftPayload = {
  readonly amount: string;
  readonly currency: string;
  readonly description?: string | null;
  readonly supplierName?: string | null;
  readonly vendorId?: string | null;
  readonly projectId?: string | null;
  readonly costFamily?: 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital' | null;
  readonly notes?: string | null;
  readonly paymentMethod?: string | null;
  readonly vatMode?: ExpenseVatMode | null;
};

export type VendorBillDraftPayload = {
  readonly vendorId: string;
  readonly projectId?: string | null;
  readonly reference?: string | null;
  readonly currency: string;
  readonly totalAmount: string;
  readonly notes?: string | null;
  readonly dueDays?: number | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
  }[];
};

export type BillingRecordDraftPayload = {
  readonly projectId: string;
  readonly amount: string;
  readonly currency?: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly dueDays?: number | null;
};

export type StoredDraftPayload =
  | { readonly kind: 'expense'; readonly data: ExpenseDraftPayload }
  | { readonly kind: 'vendor_bill'; readonly data: VendorBillDraftPayload }
  | { readonly kind: 'billing_record'; readonly data: BillingRecordDraftPayload };

export function generatedEntityPath(kind: DraftKind, entityId: string): string {
  switch (kind) {
    case 'expense':
      return `/expenses/${entityId}`;
    case 'vendor_bill':
      return `/procurement/ap/${entityId}`;
    case 'billing_record':
      return `/billing/${entityId}`;
  }
}
