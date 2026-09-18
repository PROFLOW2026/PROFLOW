import { DomainRuleError } from '@/shared/errors';
import {
  BLOCKING_ISSUANCE_OUTCOMES,
  type ExternalDocumentKind,
  type ExternalStatutoryDocument,
  type IssuanceOutcome,
} from './types';

export function isBlockingIssuanceOutcome(outcome: IssuanceOutcome | null | undefined): boolean {
  if (!outcome) return false;
  return (BLOCKING_ISSUANCE_OUTCOMES as readonly string[]).includes(outcome);
}

export function findBlockingExternalDocument(
  documents: readonly ExternalStatutoryDocument[],
  kind: ExternalDocumentKind = 'tax_invoice',
): ExternalStatutoryDocument | null {
  return (
    documents.find(
      (doc) => doc.kind === kind && isBlockingIssuanceOutcome(doc.issuanceOutcome),
    ) ?? null
  );
}

export function findReusableRejectedDocument(
  documents: readonly ExternalStatutoryDocument[],
  kind: ExternalDocumentKind = 'tax_invoice',
): ExternalStatutoryDocument | null {
  return (
    documents.find(
      (doc) =>
        doc.kind === kind &&
        doc.issuanceOutcome === 'confirmed_rejected' &&
        doc.status === 'cancelled',
    ) ?? null
  );
}

export function assertIssuanceEligible(
  documents: readonly ExternalStatutoryDocument[],
  kind: ExternalDocumentKind = 'tax_invoice',
): void {
  const blocking = findBlockingExternalDocument(documents, kind);
  if (!blocking) return;

  throw new DomainRuleError(
    'An external statutory document is already in progress or issued for this billing record',
    'invoicingIntegration.errors.duplicateIssuanceBlocked',
    {
      externalDocumentId: blocking.id,
      issuanceOutcome: blocking.issuanceOutcome,
      status: blocking.status,
    },
  );
}
