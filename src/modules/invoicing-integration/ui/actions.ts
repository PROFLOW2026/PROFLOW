'use server';

import { getBillingRecord } from '@/modules/billing';
import { buildStatutoryBridgeFromBillingRecord } from '../application/build-statutory-bridge';
import { listExternalStatutoryDocumentsForBilling } from '../application/get-external-documents';
import { refreshExternalStatutoryStatus } from '../application/refresh-external-status';
import { requestExternalStatutoryDocument } from '../application/request-external-document';
import { withOrgContext } from '@/shared/auth/session';
import { isAppError, mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

export interface ExternalStatutoryActionResult {
  error?: string;
  ok?: boolean;
}

function logUnmappedExternalDocError(action: string, error: unknown): void {
  if (error instanceof Error && isAppError(error)) return;
  console.error(`[invoicing][external-doc] ${action} unmapped error`, {
    name: error instanceof Error ? error.name : 'unknown',
    message:
      error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
  });
}

async function mapExternalDocError(error: unknown): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tInvoicing = await getTranslations('invoicingIntegration');

  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      invoicingIntegration: (key) => tInvoicing(key as 'errors.connectionRequired'),
    },
    rethrowUnknown: false,
  });

  return mapped.error;
}

export async function requestExternalStatutoryDocumentAction(
  billingRecordId: string,
): Promise<ExternalStatutoryActionResult> {
  try {
    await withOrgContext(async (context) => {
      const billing = await getBillingRecord(context, billingRecordId);
      const { bridge, idempotencyKey } = buildStatutoryBridgeFromBillingRecord(context, billing);
      await requestExternalStatutoryDocument(context, {
        billing: bridge,
        kind: 'tax_invoice',
        idempotencyKey,
      });
    });
    revalidatePath(`/billing/${billingRecordId}`);
    return { ok: true };
  } catch (error) {
    logUnmappedExternalDocError('request', error);
    return { error: await mapExternalDocError(error) };
  }
}

export async function refreshExternalStatutoryStatusAction(
  externalDocumentId: string,
  billingRecordId: string,
): Promise<ExternalStatutoryActionResult> {
  try {
    await withOrgContext(async (context) => {
      await refreshExternalStatutoryStatus(context, { externalDocumentId });
    });
    revalidatePath(`/billing/${billingRecordId}`);
    return { ok: true };
  } catch (error) {
    logUnmappedExternalDocError('refresh', error);
    return { error: await mapExternalDocError(error) };
  }
}

export async function listExternalStatutoryDocumentsAction(
  billingRecordId: string,
): Promise<{ documents: Awaited<ReturnType<typeof listExternalStatutoryDocumentsForBilling>> }> {
  return withOrgContext(async (context) => ({
    documents: await listExternalStatutoryDocumentsForBilling(context, { billingRecordId }),
  }));
}
