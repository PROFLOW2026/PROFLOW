import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents/lookups';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/stub-provider';
import type { ExtractionJob } from '../domain/types';
import { createQueuedJob, updateJob } from '../data/in-memory-ocr.store';
import type { ExtractReceiptAppInput } from '../validation/schemas';
import { extractReceiptSchema } from '../validation/schemas';

/**
 * Queue + run a receipt extraction job.
 *
 * Never creates an Expense. Successful extracted candidates land in
 * `needs_review` for explicit human confirmation.
 */
export async function extractReceiptJob(
  context: OrgContext,
  rawInput: ExtractReceiptAppInput,
  provider: OcrProvider = getOcrProvider(),
): Promise<ExtractionJob> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const input = extractReceiptSchema.parse(rawInput);

  // Cross-tenant IDOR guard: documentId must resolve inside the active org.
  if (input.documentId) {
    const document = await findDocumentById(
      context.db,
      context.organizationId,
      input.documentId,
    );
    if (!document || document.deletedAt || document.status === 'deleted') {
      throw new NotFoundError('Document');
    }
  }

  const queued = createQueuedJob({
    organizationId: context.organizationId,
    documentId: input.documentId,
    filename: input.filename ?? null,
    mimeType: input.mimeType ?? null,
    providerId: provider.id,
  });

  updateJob(context.organizationId, queued.id, { status: 'running' });

  const result = await provider.extractReceipt({
    organizationId: context.organizationId,
    documentId: input.documentId,
    contentBase64: input.contentBase64,
    mimeType: input.mimeType,
    filename: input.filename,
  });

  if (!result.ok) {
    const failed = updateJob(context.organizationId, queued.id, {
      status: 'failed',
      errorCode: result.errorCode,
      errorMessage: result.message,
      candidates: null,
    });
    return failed!;
  }

  // Financial OCR is always candidate + review — never auto-post / finalize.
  const reviewed = updateJob(context.organizationId, queued.id, {
    status: 'needs_review',
    candidates: result.candidates,
    extractedCandidates: result.candidates,
    reviewOverrides: null,
    errorCode: null,
    errorMessage: null,
  });
  return reviewed!;
}
