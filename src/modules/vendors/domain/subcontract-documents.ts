/**
 * Required-doc / insurance flags live on existing documents rows
 * (`is_required`, `required_type`, `expires_at`) - not a new store.
 */

import type { SubcontractDocumentFlags, SubcontractLinkedDocument } from './subcontract-types';

export function assessSubcontractDocuments(
  documents: readonly SubcontractLinkedDocument[],
  today: string,
): SubcontractDocumentFlags {
  const insuranceDocs = documents.filter(
    (document) => document.requiredType === 'insurance' || document.label === 'insurance',
  );
  const requiredDocs = documents.filter((document) => document.isRequired);
  const insuranceExpiresAt =
    insuranceDocs
      .map((document) => document.expiresAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

  return {
    hasInsurance: insuranceDocs.length > 0,
    insuranceExpiresAt,
    insuranceExpired: Boolean(insuranceExpiresAt && insuranceExpiresAt < today),
    requiredCount: requiredDocs.length,
    expiredRequiredCount: requiredDocs.filter(
      (document) => document.expiresAt !== null && document.expiresAt < today,
    ).length,
  };
}
