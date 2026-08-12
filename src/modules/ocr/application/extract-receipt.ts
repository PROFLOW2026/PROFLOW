import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents/lookups';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { detectDuplicateHits, shouldReuseExistingJob } from '../domain/duplicates';
import { OCR_MAX_MANUAL_RETRIES, assertOcrFileLimits, ocrPageCountForFile, resolveActiveOcrCapabilities } from '../domain/cost-controls';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import { matchVendors } from '../domain/vendor-matching';
import type { ExtractionJob, OcrSafeRawMetadata, OcrWorkflowContext } from '../domain/types';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractReceiptAppInput } from '../validation/schemas';
import { extractReceiptSchema } from '../validation/schemas';
import { loadDuplicateIndex } from './duplicate-index';
import { loadDocumentBytesForOcr, sha256Hex } from './load-document-bytes';
import { loadVendorMatchIndex } from './vendor-index';

function bytesFromBase64(contentBase64: string | undefined): Uint8Array | null {
  if (!contentBase64?.trim()) return null;
  return Uint8Array.from(Buffer.from(contentBase64, 'base64'));
}

/**
 * Queue + run a document extraction job.
 *
 * Never creates an Expense, Vendor Bill, or Vendor Credit. Successful extracted
 * candidates land in `needs_review` for explicit human confirmation.
 *
 * Production path uses a real documentId and server-side storage bytes.
 */
export async function extractReceiptJob(
  context: OrgContext,
  rawInput: ExtractReceiptAppInput,
  provider: OcrProvider = getOcrProvider(),
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const input = extractReceiptSchema.parse(rawInput);
  const workflow: OcrWorkflowContext = input.workflow ?? 'general';

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

  if (input.documentId) {
    const existing = (await repo.listJobsForOrg(context.organizationId)).filter(
      (job) => job.sourceDocument.documentId === input.documentId && job.providerId === provider.id,
    );
    const reusable = existing.find((job) => shouldReuseExistingJob(job.status));
    if (reusable && !input.forceRetry) {
      return {
        ...reusable,
        rawMetadata: {
          ...(reusable.rawMetadata ?? { providerId: provider.id }),
          reusedExistingJob: true,
        },
      };
    }
    const failed = existing.find((job) => job.status === 'failed');
    const retries = failed?.rawMetadata?.manualRetryCount ?? 0;
    if (input.forceRetry && failed && retries >= OCR_MAX_MANUAL_RETRIES) {
      throw new DomainRuleError('Retry limit reached', 'ocr.errors.retryLimit');
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

  let bytes = bytesFromBase64(input.contentBase64);
  let mimeType = input.mimeType ?? null;
  let filename = input.filename ?? null;
  let checksumSha256: string | null = null;

  if (input.documentId && !bytes) {
    try {
      const loaded = await loadDocumentBytesForOcr(context, input.documentId);
      bytes = loaded.bytes;
      mimeType = loaded.mimeType;
      filename = loaded.filename;
      checksumSha256 = loaded.checksumSha256;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      const failed = await repo.updateJob(context.organizationId, queued.id, {
        status: 'failed',
        reviewStatus: 'awaiting_review',
        errorCode: 'storage_download',
        errorMessage: 'Could not load the document for reading',
        candidates: null,
        rawMetadata: {
          providerId: provider.id,
          providerStatus: 'document_load_failed',
          workflow,
          errorCategory: 'storage_download',
        },
        overallConfidence: null,
        sourceDocument: {
          documentId: input.documentId,
          filename,
          mimeType,
        },
      });
      return failed!;
    }
  } else if (bytes) {
    checksumSha256 = sha256Hex(bytes);
  }

  if (bytes) {
    const pageCount = ocrPageCountForFile(mimeType, bytes);
    const limits = assertOcrFileLimits(
      {
        mimeType,
        sizeBytes: bytes.length,
        pageCount,
      },
      resolveActiveOcrCapabilities(provider.id),
    );
    if (!limits.ok) {
      const failed = await repo.updateJob(context.organizationId, queued.id, {
        status: 'failed',
        reviewStatus: 'awaiting_review',
        errorCode: limits.code,
        errorMessage:
          limits.code === 'too_many_pages'
            ? 'This PDF exceeds the provider page limit; the whole file was not processed'
            : limits.code === 'too_large'
              ? 'This file exceeds the provider size limit'
              : 'The file cannot be sent for document reading',
        candidates: null,
        rawMetadata: {
          providerId: provider.id,
          providerStatus: limits.code,
          checksumSha256: checksumSha256 ?? undefined,
          pageCount,
          workflow,
        },
        overallConfidence: null,
        sourceDocument: {
          documentId: input.documentId ?? null,
          filename,
          mimeType,
        },
      });
      return failed!;
    }
  }

  const result = await provider.extractDocument({
    organizationId: context.organizationId,
    documentId: input.documentId,
    bytes: bytes ?? undefined,
    contentBase64: input.contentBase64,
    mimeType: mimeType ?? undefined,
    filename: filename ?? undefined,
    workflow,
    locale: 'he',
  });

  if (!result.ok) {
    const previousRetries = input.forceRetry ? 1 : 0;
    const failed = await repo.updateJob(context.organizationId, queued.id, {
      status: 'failed',
      reviewStatus: 'awaiting_review',
      errorCode: result.errorCode,
      errorMessage: result.message,
      candidates: null,
      rawMetadata: {
        ...(result.rawMetadata ?? { providerId: provider.id, providerStatus: result.errorCode }),
        checksumSha256: checksumSha256 ?? result.rawMetadata?.checksumSha256,
        workflow,
        manualRetryCount: previousRetries,
      },
      overallConfidence: null,
      sourceDocument: {
        documentId: input.documentId ?? null,
        filename,
        mimeType,
      },
    });
    return failed!;
  }

  const vendorIndex = await loadVendorMatchIndex(context.db, context.organizationId);
  const vendorMatches = matchVendors({
    vendorName: result.candidates.vendor.value,
    companyNumber: result.candidates.companyNumber.value,
    vatId: result.candidates.vatId.value,
    vendors: vendorIndex,
  });

  const duplicateRows = await loadDuplicateIndex(context.db, context.organizationId);
  const existingJobs = await repo.listJobsForOrg(context.organizationId);
  const duplicateHits = detectDuplicateHits(
    {
      vendorId: vendorMatches[0]?.strength === 'exact_identifier' ? vendorMatches[0].vendorId : null,
      vendorName: result.candidates.vendor.value,
      companyNumber: result.candidates.companyNumber.value,
      reference: result.candidates.reference.value,
      date: result.candidates.date.value,
      amount: result.candidates.gross.value ?? result.candidates.net.value,
      currency: result.candidates.currency.value,
      checksumSha256,
      documentId: input.documentId,
      jobId: queued.id,
    },
    [
      ...duplicateRows,
      ...existingJobs.map((job) => ({
        kind: 'ocr_job' as const,
        id: job.id,
        vendorName: job.candidates?.vendor.value,
        companyNumber: job.candidates?.companyNumber.value,
        reference: job.candidates?.reference.value,
        date: job.candidates?.date.value,
        amount: job.candidates?.gross.value ?? job.candidates?.net.value,
        currency: job.candidates?.currency.value,
        checksumSha256: job.rawMetadata?.checksumSha256,
        documentId: job.sourceDocument.documentId,
      })),
    ],
  );

  const rawMetadata: OcrSafeRawMetadata = {
    ...(result.rawMetadata ?? {
      providerId: provider.id,
      overallConfidence: result.overallConfidence ?? null,
      extractedAt: new Date().toISOString(),
    }),
    checksumSha256: checksumSha256 ?? undefined,
    workflow,
    vendorMatches,
    duplicateHits,
  };

  const reviewed = await repo.updateJob(context.organizationId, queued.id, {
    status: 'needs_review',
    reviewStatus: 'awaiting_review',
    candidates: result.candidates,
    extractedCandidates: result.candidates,
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata,
    overallConfidence: result.overallConfidence ?? null,
    errorCode: null,
    errorMessage: null,
    sourceDocument: {
      documentId: input.documentId ?? null,
      filename,
      mimeType,
    },
  });
  return reviewed!;
}
