import type { OrgContext } from '@/shared/auth/context';
import { listExternalDocuments } from '../data/external-documents';
import type { ExternalDocumentStatus, ExternalStatutoryDocument } from '../domain/types';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { isExternalStatutoryUiEnabled } from './assert-feature-enabled';
import { cancelExternalStatutoryDocument } from './credit-or-cancel-external';
import { resolveStatutoryProviderForBillingHook } from './resolve-statutory-provider';

const VOID_CANCELLABLE_STATUSES = new Set<ExternalDocumentStatus>([
  'issued',
  'allocated',
  'pending',
]);

function isVoidCancellable(doc: ExternalStatutoryDocument): boolean {
  return Boolean(doc.externalId?.trim()) && VOID_CANCELLABLE_STATUSES.has(doc.status);
}

/**
 * FIN-002 — cancel issued statutory documents before AR void commits.
 * No-op when external provider mode is off or there are no cancellable docs.
 */
export async function cancelIssuedStatutoryDocumentsForBillingVoid(
  context: OrgContext,
  billingRecordId: string,
  provider?: StatutoryInvoicingProvider,
): Promise<void> {
  const resolvedProvider = await resolveStatutoryProviderForBillingHook(context, provider);
  if (!(await isExternalStatutoryUiEnabled(context, resolvedProvider))) {
    return;
  }

  const docs = await listExternalDocuments(context, billingRecordId);
  for (const doc of docs) {
    if (!isVoidCancellable(doc)) continue;
    await cancelExternalStatutoryDocument(
      context,
      {
        externalDocumentId: doc.id,
        idempotencyKey: `pf:statutory-cancel:${doc.id}:void:${billingRecordId}:v1`,
        reason: 'Billing record voided',
      },
      resolvedProvider,
    );
  }
}
