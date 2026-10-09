import type { OrgContext } from '@/shared/auth/context';
import { listExternalDocuments } from '../data/external-documents';
import { buildStatutoryIdempotencyKey } from '../domain/idempotency-key';
import type { ExternalStatutoryDocument } from '../domain/types';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { isExternalStatutoryUiEnabled } from './assert-feature-enabled';
import { creditExternalStatutoryDocument } from './credit-or-cancel-external';
import { resolveStatutoryProviderForBillingHook } from './resolve-statutory-provider';

function findTaxInvoiceToCredit(
  docs: readonly ExternalStatutoryDocument[],
): ExternalStatutoryDocument | null {
  return (
    docs.find(
      (doc) =>
        doc.kind === 'tax_invoice' &&
        Boolean(doc.externalId?.trim()) &&
        (doc.status === 'issued' || doc.status === 'allocated'),
    ) ?? null
  );
}

/**
 * FIN-004 — post internal credit_note adjustment to statutory credit (SUMIT type 5).
 * Skips when provider mode is off or no issued tax invoice exists on the original.
 */
export async function issueStatutoryCreditForBillingAdjustment(
  context: OrgContext,
  input: {
    readonly originalBillingRecordId: string;
    readonly creditNoteBillingRecordId: string;
  },
  provider?: StatutoryInvoicingProvider,
): Promise<void> {
  const resolvedProvider = await resolveStatutoryProviderForBillingHook(context, provider);
  if (!(await isExternalStatutoryUiEnabled(context, resolvedProvider))) {
    return;
  }

  const docs = await listExternalDocuments(context, input.originalBillingRecordId);
  const taxInvoice = findTaxInvoiceToCredit(docs);
  if (!taxInvoice) return;

  await creditExternalStatutoryDocument(
    context,
    {
      externalDocumentId: taxInvoice.id,
      idempotencyKey: buildStatutoryIdempotencyKey(input.creditNoteBillingRecordId, 'credit_note'),
      reason: null,
      creditNoteBillingRecordId: input.creditNoteBillingRecordId,
    },
    resolvedProvider,
  );
}
