import type { BillingRecordBridgeRef, ExternalDocumentKind, ExternalPdfMetadata } from './types';

/**
 * Pluggable statutory invoicing provider (doc 28 AccountingConnector style).
 *
 * Implementations talk to an external statutory system. ProjectFlow must never
 * mint a local statutory invoice number or pretend to be the legal issuer.
 */

export type StatutoryProviderErrorCode =
  | 'not_configured'
  | 'unsupported'
  | 'provider_error'
  | 'invalid_billing_state'
  | 'not_found';

export type StatutoryProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly errorCode: StatutoryProviderErrorCode;
      readonly message: string;
    };

export interface CreateExternalDocumentInput {
  readonly organizationId: string;
  readonly billing: BillingRecordBridgeRef;
  readonly kind: ExternalDocumentKind;
  readonly idempotencyKey: string;
}

export interface CreateExternalDocumentOutput {
  readonly externalId: string;
  readonly externalNumber: string | null;
  readonly externalUrl: string | null;
  readonly status: 'pending' | 'issued';
  readonly pdf: ExternalPdfMetadata | null;
  readonly issuedAt: string | null;
}

export interface RetrieveExternalStatusInput {
  readonly organizationId: string;
  readonly externalId: string;
}

export interface RetrieveExternalStatusOutput {
  readonly externalId: string;
  readonly externalNumber: string | null;
  readonly externalUrl: string | null;
  readonly status: 'pending' | 'issued' | 'credited' | 'cancelled' | 'failed';
  readonly pdf: ExternalPdfMetadata | null;
  readonly issuedAt: string | null;
}

export interface CreditExternalDocumentInput {
  readonly organizationId: string;
  readonly externalId: string;
  readonly reason: string | null;
  readonly idempotencyKey: string;
}

export interface CreditExternalDocumentOutput {
  readonly creditExternalId: string;
  readonly creditExternalNumber: string | null;
  readonly externalUrl: string | null;
  readonly status: 'pending' | 'credited';
}

export interface CancelExternalDocumentInput {
  readonly organizationId: string;
  readonly externalId: string;
  readonly reason: string | null;
  readonly idempotencyKey: string;
}

export interface CancelExternalDocumentOutput {
  readonly externalId: string;
  readonly status: 'cancelled' | 'pending';
}

export interface AllocateExternalReferenceInput {
  readonly organizationId: string;
  readonly externalId: string;
  readonly allocationReference: string;
  readonly billingRecordId: string;
}

export interface AllocateExternalReferenceOutput {
  readonly externalId: string;
  readonly allocationReference: string;
}

export interface StatutoryInvoicingProvider {
  readonly id: string;
  isConfigured(): boolean;
  /** False until a real provider connection is wired — keeps the product surface off. */
  isFeatureEnabled(): boolean;
  createDocument(
    input: CreateExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreateExternalDocumentOutput>>;
  retrieveStatus(
    input: RetrieveExternalStatusInput,
  ): Promise<StatutoryProviderResult<RetrieveExternalStatusOutput>>;
  creditDocument(
    input: CreditExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreditExternalDocumentOutput>>;
  cancelDocument(
    input: CancelExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CancelExternalDocumentOutput>>;
  allocateReference(
    input: AllocateExternalReferenceInput,
  ): Promise<StatutoryProviderResult<AllocateExternalReferenceOutput>>;
}
