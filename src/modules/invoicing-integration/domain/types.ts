import type { MoneyValue } from '@/shared/money';

/**
 * External statutory invoicing integration (docs 04, 09, 28).
 *
 * ProjectFlow BillingRecord remains management truth.
 * ExternalStatutoryDocument is a provider-issued legal document reference —
 * never generated or mutated as a local statutory invoice.
 */

/** Internal billing snapshot used only as the bridge source — not a statutory doc. */
export interface BillingRecordBridgeRef {
  readonly billingRecordId: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly kind: 'invoice' | 'credit_note' | 'advance' | 'retention_release';
  readonly status: 'draft' | 'finalized' | 'void';
  readonly reference: string | null;
  readonly totalAmount: MoneyValue;
  readonly issueDate: string;
  readonly dueDate: string | null;
  readonly notes: string | null;
}

export const EXTERNAL_DOCUMENT_KINDS = [
  'tax_invoice',
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

export interface ExternalPdfMetadata {
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly storageDocumentId: string | null;
  readonly fileName: string | null;
}

export interface ExternalStatutoryDocument {
  readonly id: string;
  readonly organizationId: string;
  /** Management-truth billing record this external doc is linked to. */
  readonly billingRecordId: string;
  readonly providerId: string;
  readonly kind: ExternalDocumentKind;
  readonly status: ExternalDocumentStatus;
  readonly externalId: string | null;
  readonly externalNumber: string | null;
  readonly externalUrl: string | null;
  readonly pdf: ExternalPdfMetadata | null;
  readonly allocationReference: string | null;
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

export const FULL_ADAPTER_CAPABILITIES: StatutoryProviderCapabilities = {
  createDocument: true,
  retrieveStatus: true,
  creditDocument: true,
  cancelDocument: true,
  allocateReference: true,
};
