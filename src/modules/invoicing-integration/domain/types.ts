import type { MoneyValue } from '@/shared/money';

/**
 * External statutory invoicing integration (docs 04, 09, 28).
 *
 * ProjectFlow BillingRecord remains management truth.
 * ExternalStatutoryDocument is a provider-issued legal document reference —
 * never generated or mutated as a local statutory invoice.
 */

/** Internal billing snapshot used only as the bridge source - not a statutory doc. */
export interface BillingRecordBridgeRef {
  readonly billingRecordId: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly kind: 'invoice' | 'credit_note' | 'advance' | 'retention_release';
  readonly status: 'draft' | 'finalized' | 'void';
  readonly reference: string | null;
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly totalAmount: MoneyValue;
  readonly vatMode: 'inclusive' | 'exclusive' | 'zero';
  readonly vatRatePercent: number | null;
  readonly lines: StatutoryLineItem[];
  readonly issuer: StatutoryPartySnapshot | null;
  readonly customer: StatutoryPartySnapshot | null;
  readonly issueDate: string;
  readonly dueDate: string | null;
  readonly notes: string | null;
  readonly externalReference: string;
}

export const EXTERNAL_DOCUMENT_KINDS = [
  'tax_invoice',
  'tax_invoice_receipt',
  'transaction_invoice',
  'credit_note',
  'receipt',
  'proforma',
  'other',
] as const;

export type ExternalDocumentKind = (typeof EXTERNAL_DOCUMENT_KINDS)[number];

export const EXTERNAL_DOCUMENT_STATUSES = [
  'requested',
  'pending',
  'issued',
  'allocated',
  'credited',
  'cancelled',
  'failed',
] as const;

export type ExternalDocumentStatus = (typeof EXTERNAL_DOCUMENT_STATUSES)[number];

export const ISSUANCE_OUTCOMES = [
  'in_flight',
  'confirmed_rejected',
  'confirmed_created',
  'ambiguous',
] as const;

export type IssuanceOutcome = (typeof ISSUANCE_OUTCOMES)[number];

export const BLOCKING_ISSUANCE_OUTCOMES: readonly IssuanceOutcome[] = [
  'in_flight',
  'ambiguous',
  'confirmed_created',
];

export const RECONCILIATION_STATUSES = [
  'pending',
  'matched',
  'mismatch',
  'not_available',
] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface ReconciliationMetadata {
  readonly expectedNet: string;
  readonly expectedVat: string | null;
  readonly expectedGross: string;
  readonly actualNet?: string | null;
  readonly actualVat?: string | null;
  readonly actualGross?: string | null;
  readonly currency: string;
  readonly comparedAt: string;
  readonly tolerance: string;
  readonly pdfStorageStatus?: 'pending' | 'saved' | 'failed';
  readonly pdfStorageError?: string | null;
}

export interface StatutoryPartySnapshot {
  readonly name: string;
  readonly companyNumber: string | null;
  readonly externalIdentifier: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly noVat: boolean;
}

export interface StatutoryLineItem {
  readonly description: string;
  readonly lineNet: MoneyValue;
  readonly quantity: string | null;
  readonly unitPrice: string | null;
}

export interface ExternalPdfMetadata {
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly storageDocumentId: string | null;
  readonly fileName: string | null;
}

/** Frozen payment snapshot for receipt / combined statutory issuance. */
export interface StatutoryPaymentSnapshot {
  readonly paymentId: string;
  readonly paymentDate: string;
  readonly grossAmount: string;
  readonly netAmount: string | null;
  readonly currency: string;
  readonly method: string | null;
  readonly reference: string | null;
}

export interface ExternalStatutoryDocument {
  readonly id: string;
  readonly organizationId: string;
  /** Management-truth billing record this external doc is linked to. */
  readonly billingRecordId: string;
  /** Confirmed payment — required for receipt kinds. */
  readonly paymentId: string | null;
  readonly providerId: string;
  readonly kind: ExternalDocumentKind;
  readonly status: ExternalDocumentStatus;
  readonly externalId: string | null;
  readonly externalNumber: string | null;
  readonly externalUrl: string | null;
  readonly pdf: ExternalPdfMetadata | null;
  readonly allocationReference: string | null;
  readonly issuanceOutcome: IssuanceOutcome | null;
  readonly reconciliationStatus: ReconciliationStatus | null;
  readonly reconciliationMetadata: ReconciliationMetadata | null;
  readonly idempotencyKey: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly issuedAt: string | null;
}

export interface StatutoryProviderStatus {
  readonly providerId: string;
  readonly configured: boolean;
  /** Feature stays off until a real provider connection exists. */
  readonly featureEnabled: boolean;
  readonly messageKey: string;
  readonly capabilities: StatutoryProviderCapabilities;
}

export interface StatutoryProviderCapabilities {
  readonly createDocument: boolean;
  readonly retrieveStatus: boolean;
  readonly creditDocument: boolean;
  readonly cancelDocument: boolean;
  readonly allocateReference: boolean;
}

export const DISABLED_CAPABILITIES: StatutoryProviderCapabilities = {
  createDocument: false,
  retrieveStatus: false,
  creditDocument: false,
  cancelDocument: false,
  allocateReference: false,
};

/** Scripted test adapter only. SUMIT must not report this while credit/cancel/allocate return unsupported. */
export const FULL_ADAPTER_CAPABILITIES: StatutoryProviderCapabilities = {
  createDocument: true,
  retrieveStatus: true,
  creditDocument: true,
  cancelDocument: true,
  allocateReference: true,
};

/** Live SUMIT statutory provider. The only host is https://api.sumit.co.il. */
export const SUMIT_PROVIDER_ID = 'sumit' as const;

export interface InvoicingProviderCredentials {
  readonly companyId: number;
  readonly apiKey: string;
}
