import type { ExternalDocumentKind } from './types';

/** Canonical PF idempotency key — one external_statutory_documents row per billing+kind. */
export function buildStatutoryIdempotencyKey(
  billingRecordId: string,
  kind: ExternalDocumentKind = 'tax_invoice',
): string {
  return `pf:${billingRecordId}:${kind}:v1`;
}

/** SUMIT Details.ExternalReference — same as idempotency key for confirmed-rejected same-row retry. */
export function buildStatutoryExternalReference(
  billingRecordId: string,
  kind: ExternalDocumentKind = 'tax_invoice',
): string {
  return buildStatutoryIdempotencyKey(billingRecordId, kind);
}
