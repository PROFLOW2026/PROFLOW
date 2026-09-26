import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { finalizeDocumentUpload } from '@/modules/documents';
import { findDocumentById } from '@/modules/documents/lookups';
import { listCaptureDocumentsByCaptureId } from '../data/capture-documents.repository';
import { findCaptureById, updateCaptureItem } from '../data/quick-capture.repository';
import type { CaptureItemRecord } from '../domain/types';
import { processCapture } from './process-capture';

export type FinalizeCaptureUploadInput = {
  readonly captureId: string;
  readonly documents: readonly {
    readonly documentId: string;
    readonly sizeBytes: number;
    readonly checksum?: string | null;
  }[];
};

export async function finalizeCaptureUpload(
  context: OrgContext,
  input: FinalizeCaptureUploadInput,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.status !== 'captured' && capture.status !== 'failed') {
    throw new DomainRuleError('Capture is not awaiting upload', 'quickCapture.errors.notAwaitingUpload');
  }

  const junctionDocs = await listCaptureDocumentsByCaptureId(
    context.db,
    context.organizationId,
    capture.id,
  );
  const expectedIds = new Set(junctionDocs.map((row) => row.documentId));
  if (input.documents.length !== junctionDocs.length) {
    throw new DomainRuleError('Missing session documents', 'quickCapture.errors.incompleteUpload');
  }

  for (const doc of input.documents) {
    if (!expectedIds.has(doc.documentId)) {
      throw new DomainRuleError('Document not in capture session', 'quickCapture.errors.documentNotInSession');
    }
    try {
      await finalizeDocumentUpload(context, {
        documentId: doc.documentId,
        sizeBytes: doc.sizeBytes,
        checksum: doc.checksum ?? undefined,
      });
    } catch (error) {
      await updateCaptureItem(context.db, context.organizationId, capture.id, {
        status: 'failed',
        processingErrorCode: 'upload_finalize_failed',
        processingErrorMessage: error instanceof Error ? error.message : 'Upload finalize failed',
      });
      throw error;
    }
  }

  for (const junction of junctionDocs) {
    const document = await findDocumentById(
      context.db,
      context.organizationId,
      junction.documentId,
    );
    if (!document || document.status !== 'available') {
      await updateCaptureItem(context.db, context.organizationId, capture.id, {
        status: 'failed',
        processingErrorCode: 'upload_not_ready',
        processingErrorMessage: 'One or more session files did not finalize',
      });
      throw new DomainRuleError('Upload not complete', 'quickCapture.errors.uploadNotComplete');
    }
  }

  const processing = await updateCaptureItem(context.db, context.organizationId, capture.id, {
    status: 'processing',
    processingErrorCode: null,
    processingErrorMessage: null,
  });
  if (!processing) throw new NotFoundError('Quick capture');

  return processCapture(context, capture.id);
}
