import type { ExternalStatutoryDocument } from './types';

export type PaymentReceiptOutcome = 'none' | 'issued' | 'pending' | 'failed';

const RECEIPT_KINDS = new Set(['receipt', 'tax_invoice_receipt']);

/** Derives receipt issuance state for a just-recorded payment (UI feedback only). */
export function resolvePaymentReceiptOutcome(
  documents: readonly ExternalStatutoryDocument[],
  paymentId: string | null | undefined,
): PaymentReceiptOutcome {
  if (!paymentId) return 'none';

  const receiptDocs = documents.filter(
    (doc) => doc.paymentId === paymentId && RECEIPT_KINDS.has(doc.kind),
  );
  if (receiptDocs.length === 0) return 'none';

  if (
    receiptDocs.some(
      (doc) => doc.issuanceOutcome === 'confirmed_created' && Boolean(doc.externalId),
    )
  ) {
    return 'issued';
  }

  if (
    receiptDocs.some(
      (doc) =>
        doc.status === 'failed' ||
        doc.issuanceOutcome === 'confirmed_rejected' ||
        doc.issuanceOutcome === 'ambiguous',
    )
  ) {
    return 'failed';
  }

  return 'pending';
}
