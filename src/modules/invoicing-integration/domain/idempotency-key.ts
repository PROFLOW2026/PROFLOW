import type { ExternalDocumentKind } from './types';

const PAYMENT_LINKED_KINDS = new Set<ExternalDocumentKind>(['receipt', 'tax_invoice_receipt']);

export function isPaymentLinkedStatutoryKind(kind: ExternalDocumentKind): boolean {
  return PAYMENT_LINKED_KINDS.has(kind);
}

/** Canonical PF idempotency key — billing kinds or payment-scoped receipt kinds. */
export function buildStatutoryIdempotencyKey(
  billingRecordId: string,
  kind: ExternalDocumentKind = 'tax_invoice',
  paymentId?: string | null,
): string {
  if (kind === 'receipt' && paymentId) {
    return `pf:payment:${paymentId}:receipt:v1`;
  }
  if (kind === 'tax_invoice_receipt' && paymentId) {
    return `pf:payment:${paymentId}:tax_invoice_receipt:v1`;
  }
  return `pf:${billingRecordId}:${kind}:v1`;
}

/** SUMIT Details.ExternalReference — same as idempotency key for confirmed-rejected same-row retry. */
export function buildStatutoryExternalReference(
  billingRecordId: string,
  kind: ExternalDocumentKind = 'tax_invoice',
  paymentId?: string | null,
): string {
  return buildStatutoryIdempotencyKey(billingRecordId, kind, paymentId);
}
