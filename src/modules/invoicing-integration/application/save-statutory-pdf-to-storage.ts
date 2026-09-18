import 'server-only';

import {
  finalizeDocumentUpload,
  findDocumentById,
  listAllDocuments,
  prepareDocumentUpload,
  updateDocumentById,
} from '@/modules/documents';
import { findStorageFileByDocumentId } from '@/modules/external-storage/data/files.repository';
import { uploadDocumentToExternalStorage } from '@/modules/external-storage/server';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import {
  buildStatutoryPdfFileName,
  statutoryPdfStorageTag,
} from '../domain/statutory-pdf-filename';
import type { ReconciliationMetadata } from '../domain/types';
import { resolveStatutoryPdfBytes } from './resolve-statutory-pdf';

export type StatutoryPdfStorageResult =
  | { readonly status: 'saved' | 'idempotent'; readonly storageDocumentId: string }
  | { readonly status: 'failed'; readonly message: string };

function withPdfStorageMetadata(
  existing: ReconciliationMetadata | null,
  patch: Pick<ReconciliationMetadata, 'pdfStorageStatus' | 'pdfStorageError'>,
): ReconciliationMetadata {
  return {
    expectedNet: existing?.expectedNet ?? '0',
    expectedVat: existing?.expectedVat ?? null,
    expectedGross: existing?.expectedGross ?? '0',
    currency: existing?.currency ?? 'ILS',
    comparedAt: existing?.comparedAt ?? new Date().toISOString(),
    tolerance: existing?.tolerance ?? '0.01',
    actualNet: existing?.actualNet,
    actualVat: existing?.actualVat,
    actualGross: existing?.actualGross,
    pdfStorageStatus: patch.pdfStorageStatus,
    pdfStorageError: patch.pdfStorageError ?? null,
  };
}

export async function saveStatutoryPdfToStorage(
  context: OrgContext,
  externalDocumentId: string,
): Promise<StatutoryPdfStorageResult> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const foundDoc = await findExternalDocument(context, externalDocumentId);
  if (!foundDoc) throw new NotFoundError('ExternalStatutoryDocument');
  const doc = foundDoc;
  if (!doc.externalId || doc.issuanceOutcome !== 'confirmed_created') {
    throw new DomainRuleError(
      'Statutory document is not issued',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  if (doc.pdf?.storageDocumentId) {
    return { status: 'idempotent', storageDocumentId: doc.pdf.storageDocumentId };
  }

  const tag = statutoryPdfStorageTag(doc.providerId, doc.externalId);
  const fileName = buildStatutoryPdfFileName(doc.externalNumber);

  async function persistSavedCopy(input: {
    storageDocumentId: string;
    contentType: string;
    byteSize: number;
    checksumSha256: string;
    fileName: string;
  }): Promise<StatutoryPdfStorageResult> {
    await updateExternalDocument(context, doc.id, {
      pdf: {
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        storageDocumentId: input.storageDocumentId,
        fileName: input.fileName,
      },
      reconciliationMetadata: withPdfStorageMetadata(doc.reconciliationMetadata, {
        pdfStorageStatus: 'saved',
        pdfStorageError: null,
      }),
    });
    return { status: 'saved', storageDocumentId: input.storageDocumentId };
  }

  const existingTagged = await listAllDocuments(context.db, context.organizationId, {
    tags: tag,
    limit: 5,
  });
  const availableHit = existingTagged.find((row) => row.status === 'available');
  if (availableHit) {
    await updateExternalDocument(context, doc.id, {
      pdf: {
        contentType: availableHit.mimeType,
        byteSize: availableHit.sizeBytes,
        checksumSha256: doc.pdf?.checksumSha256 ?? null,
        storageDocumentId: availableHit.id,
        fileName: availableHit.originalFilename,
      },
      reconciliationMetadata: withPdfStorageMetadata(doc.reconciliationMetadata, {
        pdfStorageStatus: 'saved',
        pdfStorageError: null,
      }),
    });
    return { status: 'idempotent', storageDocumentId: availableHit.id };
  }

  for (const pending of existingTagged.filter((row) => row.status === 'pending')) {
    const storageFile = await findStorageFileByDocumentId(
      context.db,
      context.organizationId,
      pending.id,
    );
    if (!storageFile) continue;

    const stored = await findDocumentById(context.db, context.organizationId, pending.id);
    if (!stored?.externalFileId) continue;

    await finalizeDocumentUpload(context, {
      documentId: pending.id,
      sizeBytes: storageFile.sizeBytes ?? stored.sizeBytes ?? 0,
    });

    return persistSavedCopy({
      storageDocumentId: pending.id,
      contentType: stored.mimeType,
      byteSize: storageFile.sizeBytes ?? stored.sizeBytes ?? 0,
      checksumSha256: storageFile.checksum ?? doc.pdf?.checksumSha256 ?? '',
      fileName: stored.originalFilename || fileName,
    });
  }

  try {
    const resolved = await resolveStatutoryPdfBytes(context, externalDocumentId);

    const stalePending = existingTagged.find((row) => row.status === 'pending');
    const documentId = stalePending?.id;

    if (!documentId) {
      const prepared = await prepareDocumentUpload(context, {
        fileName,
        mimeType: resolved.contentType,
        sizeBytes: resolved.bytes.length,
        ownerType: 'billing_record',
        ownerId: doc.billingRecordId,
        label: tag,
        privacyClass: 'standard',
      });

      await updateDocumentById(context.db, context.organizationId, prepared.document.id, {
        tags: tag,
        category: 'statutory_invoice',
        originalFilename: fileName,
      });

      await uploadDocumentToExternalStorage(context, {
        documentId: prepared.document.id,
        parentSemanticFolder: 'billing',
        fileName,
        mimeType: resolved.contentType,
        body: resolved.bytes,
        sizeBytes: resolved.bytes.length,
      });

      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: resolved.bytes.length,
      });

      return persistSavedCopy({
        storageDocumentId: prepared.document.id,
        contentType: resolved.contentType,
        byteSize: resolved.bytes.length,
        checksumSha256: resolved.checksumSha256,
        fileName,
      });
    }

    await updateDocumentById(context.db, context.organizationId, documentId, {
      tags: tag,
      category: 'statutory_invoice',
      originalFilename: fileName,
    });

    await uploadDocumentToExternalStorage(context, {
      documentId,
      parentSemanticFolder: 'billing',
      fileName,
      mimeType: resolved.contentType,
      body: resolved.bytes,
      sizeBytes: resolved.bytes.length,
    });

    await finalizeDocumentUpload(context, {
      documentId,
      sizeBytes: resolved.bytes.length,
    });

    return persistSavedCopy({
      storageDocumentId: documentId,
      contentType: resolved.contentType,
      byteSize: resolved.bytes.length,
      checksumSha256: resolved.checksumSha256,
      fileName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 300) : 'Storage save failed';
    await updateExternalDocument(context, doc.id, {
      reconciliationMetadata: withPdfStorageMetadata(doc.reconciliationMetadata, {
        pdfStorageStatus: 'failed',
        pdfStorageError: message,
      }),
    });
    if (error instanceof ServiceUnavailableError) {
      return { status: 'failed', message };
    }
    return { status: 'failed', message };
  }
}
