import type { BusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';

export type BillingRecordStatus = 'draft' | 'finalized' | 'void';
export type BillingKind = 'invoice' | 'credit_note' | 'advance' | 'retention_release';
export type PaymentRecordStatus = 'recorded' | 'void';

/** Derived collection state — never stored (doc 04 §9). */
export type CollectionStatus = 'open' | 'partial' | 'paid' | 'overdue';

export interface TaxSnapshot {
  readonly subtotalAmount: string;
  readonly taxAmount: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly capturedAt: string;
}

export interface BillingLineRecord {
  readonly id: string;
  readonly description: string;
  readonly lineTotal: MoneyValue;
  readonly changeOrderId: string | null;
  readonly sortOrder: number;
}

export interface PaymentSummary {
  readonly id: string;
  readonly amount: MoneyValue;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: PaymentRecordStatus;
  readonly notes: string | null;
}

export interface BillingRecordSummary {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly reference: string | null;
  readonly issueDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly status: BillingRecordStatus;
  readonly kind: BillingKind;
  readonly totalAmount: MoneyValue;
  readonly paidAmount: MoneyValue;
  readonly outstandingAmount: MoneyValue;
  readonly collectionStatus: CollectionStatus | null;
}

export interface BillingRecordDetail extends BillingRecordSummary {
  readonly clientId: string | null;
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly taxSnapshot: TaxSnapshot | null;
  readonly finalizedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidsBillingRecordId: string | null;
  readonly externalDocumentId: string | null;
  readonly notes: string | null;
  readonly lines: readonly BillingLineRecord[];
  readonly payments: readonly PaymentSummary[];
}

export interface UnbilledChangeOrder {
  readonly id: string;
  readonly reference: string | null;
  readonly direction: 'addition' | 'reduction';
  readonly amount: MoneyValue;
  readonly effectiveDate: BusinessDate;
}

export type BillingListFilter = 'all' | 'paid' | 'outstanding' | 'overdue';

export interface BillingListFilters {
  readonly filter?: BillingListFilter;
  readonly projectId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ProjectOption {
  readonly id: string;
  readonly name: string;
  readonly currency: string | null;
}
