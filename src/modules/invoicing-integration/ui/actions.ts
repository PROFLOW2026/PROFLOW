'use server';

import { listExternalStatutoryDocumentsForBilling } from '../application/get-external-documents';
import { refreshExternalStatutoryStatus } from '../application/refresh-external-status';
import { requestExternalStatutoryDocumentCommitted } from '../application/request-external-document';
import { saveStatutoryPdfToStorage } from '../application/save-statutory-pdf-to-storage';
import { sendExternalStatutoryDocument } from '../application/send-external-statutory-document';
import {
  buildStatutoryShareUrl,
  createStatutoryShareToken,
} from '../application/statutory-share-token';
import { requireSession, withOrgContext } from '@/shared/auth/session';
import { isAppError, mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

export interface ExternalStatutoryActionResult {
  error?: string;
  ok?: boolean;
  storageDocumentId?: string;
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
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return { error: await mapExternalDocError(new Error('No active organization')) };
    }

    await requestExternalStatutoryDocumentCommitted(
      session.user.id,
      session.activeOrganizationId,
      billingRecordId,
    );
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

export async function saveStatutoryPdfToStorageAction(
  externalDocumentId: string,
  billingRecordId: string,
): Promise<ExternalStatutoryActionResult> {
  try {
    const result = await withOrgContext(async (context) =>
      saveStatutoryPdfToStorage(context, externalDocumentId),
    );
    revalidatePath(`/billing/${billingRecordId}`);
    if (result.status === 'failed') {
      const tInvoicing = await getTranslations('invoicingIntegration');
      return { error: tInvoicing('storage.failedStatus') };
    }
    return { ok: true, storageDocumentId: result.storageDocumentId };
  } catch (error) {
    logUnmappedExternalDocError('savePdf', error);
    return { error: await mapExternalDocError(error) };
  }
}

export async function resolveStatutoryStorageLocationAction(
  storageDocumentId: string,
): Promise<{ url?: string; error?: string }> {
  try {
    return await withOrgContext(async (context) => {
      const { findDocumentById } = await import('@/modules/documents');
      const { getExternalFileDownload } = await import('@/modules/external-storage/server');
      const document = await findDocumentById(
        context.db,
        context.organizationId,
        storageDocumentId,
      );
      if (!document?.externalConnectionId || !document.externalFileId) {
        return { error: 'location_unavailable' };
      }
      const payload = await getExternalFileDownload(context, {
        connectionId: document.externalConnectionId,
        externalFileId: document.externalFileId,
        filename: document.originalFilename,
        mimeType: document.mimeType,
        documentId: document.id,
      });
      if ('url' in payload && payload.url) {
        return { url: payload.url };
      }
      return { error: 'location_unavailable' };
    });
  } catch (error) {
    logUnmappedExternalDocError('storageLocation', error);
    return { error: await mapExternalDocError(error) };
  }
}

export async function sendExternalStatutoryDocumentAction(
  externalDocumentId: string,
  billingRecordId: string,
  emailAddress: string,
): Promise<ExternalStatutoryActionResult> {
  try {
    await withOrgContext(async (context) => {
      await sendExternalStatutoryDocument(context, {
        externalDocumentId,
        emailAddress,
      });
    });
    revalidatePath(`/billing/${billingRecordId}`);
    return { ok: true };
  } catch (error) {
    logUnmappedExternalDocError('send', error);
    return { error: await mapExternalDocError(error) };
  }
}

export async function createStatutoryShareLinkAction(
  externalDocumentId: string,
): Promise<{ shareUrl?: string; error?: string }> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return { error: await mapExternalDocError(new Error('No active organization')) };
    }
    const token = createStatutoryShareToken({
      organizationId: session.activeOrganizationId,
      externalDocumentId,
    });
    return { shareUrl: buildStatutoryShareUrl(token) };
  } catch (error) {
    logUnmappedExternalDocError('share', error);
    return { error: await mapExternalDocError(error) };
  }
}
