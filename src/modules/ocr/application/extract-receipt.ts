import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents/lookups';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import type { ExtractionJob } from '../domain/types';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractReceiptAppInput } from '../validation/schemas';
import { extractReceiptSchema } from '../validation/schemas';

/**
 * Queue + run a receipt extraction job.
 *
 * Never creates an Expense or Vendor Bill. Successful extracted candidates land
 * in `needs_review` for explicit human confirmation.
 *
 * Customer-facing enablement is enforced in server actions / review page via
 * the feature gate — this application function stays callable for tests.
 */
export async function extractReceiptJob(
  context: OrgContext,
  rawInput: ExtractReceiptAppInput,
  provider: OcrProvider = getOcrProvider(),
  repo: OcrRepository = getOcrRepository(context.db),
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

  const queued = await repo.createQueuedJob({
    organizationId: context.organizationId,
    documentId: input.documentId,
    filename: input.filename ?? null,
    mimeType: input.mimeType ?? null,
    providerId: provider.id,
  });

  await repo.updateJob(context.organizationId, queued.id, { status: 'running' });

  const result = await provider.extractReceipt({
    organizationId: context.organizationId,
    documentId: input.documentId,
    contentBase64: input.contentBase64,
    mimeType: input.mimeType,
    filename: input.filename,
  });

  if (!result.ok) {
    const failed = await repo.updateJob(context.organizationId, queued.id, {
      status: 'failed',
      reviewStatus: 'awaiting_review',
      errorCode: result.errorCode,
      errorMessage: result.message,
      candidates: null,
      rawMetadata: result.rawMetadata ?? {
        providerId: provider.id,
        providerStatus: result.errorCode,
      },
      overallConfidence: null,
    });
    return failed!;
  }

  // Financial OCR is always candidate + review — never auto-post / finalize.
  const reviewed = await repo.updateJob(context.organizationId, queued.id, {
    status: 'needs_review',
    reviewStatus: 'awaiting_review',
    candidates: result.candidates,
    extractedCandidates: result.candidates,
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: result.rawMetadata ?? {
      providerId: provider.id,
      overallConfidence: result.overallConfidence ?? null,
      extractedAt: new Date().toISOString(),
    },
    overallConfidence: result.overallConfidence ?? null,
    errorCode: null,
    errorMessage: null,
  });
  return reviewed!;
}
