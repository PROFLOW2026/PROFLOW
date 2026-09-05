import type { BusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';

export type BillingRecordStatus = 'draft' | 'finalized' | 'void';
export type BillingKind = 'invoice' | 'credit_note' | 'advance' | 'retention_release';
export type PaymentRecordStatus = 'recorded' | 'void';

/** Derived collection state - never stored (doc 04 §9). */
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

/** Payment applied to a billing record - for AR history, not a separate ledger. */
export interface PaymentApplicationRow {
  readonly id: string;
  readonly paymentId: string;
  readonly billingRecordId: string;
  readonly billingReference: string | null;
  readonly billingKind: BillingKind;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly amount: MoneyValue;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: PaymentRecordStatus;
  readonly notes: string | null;
}

/** Cash on account — recorded payment with unallocated remainder. */
export interface UnallocatedPaymentRow {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string | null;
  readonly amount: MoneyValue;
  readonly appliedAmount: MoneyValue;
  readonly unallocatedAmount: MoneyValue;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: PaymentRecordStatus;
  readonly notes: string | null;
}

export interface PaymentApplicationFilters {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeVoided?: boolean;
}

export interface BillingRecordSummary {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly contractId?: string | null;
  readonly contractName?: string | null;
  /** Billing stamp, else the project's client. */
  readonly clientId?: string | null;
  readonly reference: string | null;
  readonly issueDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly status: BillingRecordStatus;
  readonly kind: BillingKind;
  readonly totalAmount: MoneyValue;
  readonly paidAmount: MoneyValue;
  readonly outstandingAmount: MoneyValue;
  /** Original holdback - cash timing, not a second invoiced amount. */
  readonly retentionAmount?: MoneyValue;
  /** Still held; reduces receivable-now only. */
  readonly retentionHeldRemaining?: MoneyValue;
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
  /** Billing stamped with this client, or billed on a project linked to this client. */
  readonly clientId?: string;
  readonly contractId?: string;
  readonly limit?: number;
  readonly offset?: number;
  /** Filter by billing record issueDate (inclusive). Date string YYYY-MM-DD. */
  readonly fromDate?: string | null;
  readonly toDate?: string | null;
}

export interface ProjectOption {
  readonly id: string;
  readonly name: string;
  readonly currency: string | null;
  readonly clientId: string | null;
}

export interface BillingContractOption {
  readonly id: string;
  readonly projectId: string;
  readonly name: string | null;
  readonly contractNumber: string | null;
  readonly isPrimary: boolean;
}
