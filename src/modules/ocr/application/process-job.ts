import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { detectDuplicateHits } from '../domain/duplicates';
import {
  assertOcrFileLimits,
  ocrPageCountForFile,
  resolveActiveOcrCapabilities,
} from '../domain/cost-controls';
import {
  isOcrCancelableStatus,
  isOcrTerminalJobStatus,
  mapProviderSuccessToJobStatus,
  ocrRetryBackoffMs,
  recountOcrBatchFromJobs,
  shouldRetryOcrAttempt,
} from '../domain/job-lifecycle';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import { matchVendors } from '../domain/vendor-matching';
import type {
  ExtractionJob,
  OcrSafeRawMetadata,
  OcrWorkflowContext,
} from '../domain/types';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractReceiptAppInput } from '../validation/schemas';
import { loadDuplicateIndex } from './duplicate-index';
import { loadDocumentBytesForOcr, sha256Hex } from './load-document-bytes';
import { loadVendorMatchIndex } from './vendor-index';

const payloadsByJobId = new Map<string, ExtractReceiptAppInput>();
const inFlightJobIds = new Set<string>();
const pendingWork = new Set<Promise<unknown>>();

type RegisteredOcrWork = {
  readonly context: OrgContext;
  readonly jobId: string;
  readonly provider: OcrProvider;
  readonly repo: OcrRepository;
};

const registeredWorkerJobs: RegisteredOcrWork[] = [];
let registerInProcessDrain = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

function bytesFromBase64(contentBase64: string | undefined): Uint8Array | null {
  if (!contentBase64?.trim()) return null;
  return Uint8Array.from(Buffer.from(contentBase64, 'base64'));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rememberOcrJobPayload(jobId: string, input: ExtractReceiptAppInput): void {
  payloadsByJobId.set(jobId, input);
}

export function setOcrBackgroundProcessingForTests(enabled: boolean): void {
  registerInProcessDrain = enabled;
}

/**
 * Same-process drain for tests. Production OCR processing is claimed by
 * `drainDurableOcrQueue` (enqueue kick via Next.js `after()`, plus daily
 * recovery cron) — never setImmediate.
 */
export function registerOcrJobForWorker(work: RegisteredOcrWork): void {
  if (!registerInProcessDrain) return;
  registeredWorkerJobs.push(work);
}

export async function flushOcrBackgroundJobs(): Promise<void> {
  while (registeredWorkerJobs.length > 0 || pendingWork.size > 0) {
    const next = registeredWorkerJobs.shift();
    if (next) {
      await processQueuedJob(next.context, next.jobId, next.provider, next.repo);
    }
    if (pendingWork.size > 0) {
      await Promise.all([...pendingWork]);
    }
  }
}

export function resetOcrBackgroundJobsForTests(): void {
  payloadsByJobId.clear();
  inFlightJobIds.clear();
  pendingWork.clear();
  registeredWorkerJobs.length = 0;
  registerInProcessDrain = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/** @deprecated Fire-and-forget is not a production worker. Tests use registerOcrJobForWorker. */
export function spawnOcrJobProcessing(work: () => Promise<unknown>): void {
  void work;
}

async function refreshBatchProgress(
  organizationId: string,
  batchId: string | null,
  repo: OcrRepository,
): Promise<void> {
  if (!batchId) return;
  const batch = await repo.findBatch(organizationId, batchId);
  if (!batch) return;
  const jobs = await repo.listJobsForOrg(organizationId, { batchId });
  const next = recountOcrBatchFromJobs(jobs, batch.totalCount || jobs.length);
  await repo.updateBatch(organizationId, batchId, next);
}

/**
 * Worker: claim queued → processing, call provider, land in needs_review or failed.
 * Idempotent. Never creates Expense / Vendor Bill / Vendor Credit.
 */
export async function processQueuedJob(
  context: OrgContext,
  jobId: string,
  provider: OcrProvider = getOcrProvider(),
  repo: OcrRepository = getOcrRepository(context.db),
  options: { readonly alreadyClaimed?: boolean } = {},
): Promise<ExtractionJob | null> {
  const existing = await repo.findJob(context.organizationId, jobId);
  if (!existing) return null;

  if (existing.status === 'cancelled' || isOcrTerminalJobStatus(existing.status)) {
    return existing;
  }

  if (inFlightJobIds.has(jobId)) {
    return existing;
  }
  inFlightJobIds.add(jobId);

  try {
    const claimed = options.alreadyClaimed
      ? existing
      : await repo.claimJob(context.organizationId, jobId, ['queued'], {
          status: 'processing',
          startedAt: new Date().toISOString(),
          attemptCount: existing.attemptCount + 1,
        });

    if (!claimed) {
      return repo.findJob(context.organizationId, jobId);
    }

    await refreshBatchProgress(context.organizationId, claimed.batchId, repo);

    const input = payloadsByJobId.get(jobId) ?? {
      documentId: claimed.sourceDocument.documentId,
      filename: claimed.sourceDocument.filename ?? undefined,
      mimeType: claimed.sourceDocument.mimeType ?? undefined,
      workflow: (claimed.rawMetadata?.workflow ?? 'general') as OcrWorkflowContext,
    };
    const workflow: OcrWorkflowContext = input.workflow ?? 'general';

    let attempt = claimed.attemptCount > 0 ? claimed.attemptCount : 1;
    let current = claimed;

    while (true) {
      const latest = await repo.findJob(context.organizationId, jobId);
      if (!latest || latest.status === 'cancelled') {
        return latest;
      }
      current = latest;

      if (current.status === 'queued') {
        const nextClaim = await repo.claimJob(context.organizationId, jobId, ['queued'], {
          status: 'processing',
          startedAt: new Date().toISOString(),
          attemptCount: current.attemptCount + 1,
        });
        if (!nextClaim) return repo.findJob(context.organizationId, jobId);
        current = nextClaim;
        attempt = current.attemptCount;
      } else if (current.status !== 'processing' && current.status !== 'running') {
        return current;
      }

      let processed: ExtractionJob;
      try {
        processed = await runProviderAttempt({
          context,
          job: current,
          input,
          workflow,
          provider,
          repo,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR processing failed';
        const failed = await repo.updateJob(context.organizationId, jobId, {
          status: 'failed',
          reviewStatus: 'awaiting_review',
          errorCode: error instanceof NotFoundError ? 'not_found' : 'provider_error',
          errorMessage: message,
          lastError: message,
          completedAt: new Date().toISOString(),
        });
        processed = failed ?? current;
      }

      if (processed.status === 'needs_review' || processed.status === 'cancelled') {
        await refreshBatchProgress(context.organizationId, processed.batchId, repo);
        return processed;
      }

      if (
        processed.status === 'failed' &&
        shouldRetryOcrAttempt(attempt, processed.errorCode)
      ) {
        await sleep(ocrRetryBackoffMs(attempt));
        const requeued = await repo.updateJob(context.organizationId, jobId, {
          status: 'queued',
          lastError: processed.lastError ?? processed.errorMessage,
        });
        current = requeued ?? processed;
        continue;
      }

      await refreshBatchProgress(context.organizationId, processed.batchId, repo);
      return processed;
    }
  } finally {
    inFlightJobIds.delete(jobId);
  }
}

async function runProviderAttempt(args: {
  context: OrgContext;
  job: ExtractionJob;
  input: ExtractReceiptAppInput;
  workflow: OcrWorkflowContext;
  provider: OcrProvider;
  repo: OcrRepository;
}): Promise<ExtractionJob> {
  const { context, job, input, workflow, provider, repo } = args;
  const queuedId = job.id;

  let bytes = bytesFromBase64(input.contentBase64);
  let mimeType = input.mimeType ?? job.sourceDocument.mimeType;
  let filename = input.filename ?? job.sourceDocument.filename;
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
      const failed = await repo.updateJob(context.organizationId, queuedId, {
        status: 'failed',
        reviewStatus: 'awaiting_review',
        errorCode: 'storage_download',
        errorMessage: 'Could not load the document for reading',
        lastError: 'Could not load the document for reading',
        completedAt: new Date().toISOString(),
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
      const failed = await repo.updateJob(context.organizationId, queuedId, {
        status: 'failed',
        reviewStatus: 'awaiting_review',
        errorCode: limits.code,
        errorMessage:
          limits.code === 'too_many_pages'
            ? 'This PDF exceeds the provider page limit; the whole file was not processed'
            : limits.code === 'too_large'
              ? 'This file exceeds the provider size limit'
              : 'The file cannot be sent for document reading',
        lastError: limits.code,
        completedAt: new Date().toISOString(),
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
          documentId: input.documentId ?? job.sourceDocument.documentId,
          filename,
          mimeType,
        },
      });
      return failed!;
    }
  }

  const result = await provider.extractDocument({
    organizationId: context.organizationId,
    documentId: input.documentId ?? job.sourceDocument.documentId ?? undefined,
    bytes: bytes ?? undefined,
    contentBase64: input.contentBase64,
    mimeType: mimeType ?? undefined,
    filename: filename ?? undefined,
    workflow,
    locale: 'he',
  });

  if (!result.ok) {
    const previousRetries = input.forceRetry
      ? (job.rawMetadata?.manualRetryCount ?? 0)
      : (job.rawMetadata?.manualRetryCount ?? 0);
    const failed = await repo.updateJob(context.organizationId, queuedId, {
      status: 'failed',
      reviewStatus: 'awaiting_review',
      errorCode: result.errorCode,
      errorMessage: result.message,
      lastError: result.message,
      completedAt: new Date().toISOString(),
      candidates: null,
      rawMetadata: {
        ...(result.rawMetadata ?? { providerId: provider.id, providerStatus: result.errorCode }),
        checksumSha256: checksumSha256 ?? result.rawMetadata?.checksumSha256,
        workflow,
        manualRetryCount: previousRetries,
      },
      overallConfidence: null,
      sourceDocument: {
        documentId: input.documentId ?? job.sourceDocument.documentId,
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
      documentId: input.documentId ?? job.sourceDocument.documentId,
      jobId: queuedId,
    },
    [
      ...duplicateRows,
      ...existingJobs.map((item) => ({
        kind: 'ocr_job' as const,
        id: item.id,
        vendorName: item.candidates?.vendor.value,
        companyNumber: item.candidates?.companyNumber.value,
        reference: item.candidates?.reference.value,
        date: item.candidates?.date.value,
        amount: item.candidates?.gross.value ?? item.candidates?.net.value,
        currency: item.candidates?.currency.value,
        checksumSha256: item.rawMetadata?.checksumSha256,
        documentId: item.sourceDocument.documentId,
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

  const reviewed = await repo.updateJob(context.organizationId, queuedId, {
    status: mapProviderSuccessToJobStatus(),
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
    lastError: null,
    completedAt: new Date().toISOString(),
    sourceDocument: {
      documentId: input.documentId ?? job.sourceDocument.documentId,
      filename,
      mimeType,
    },
  });
  return reviewed!;
}

export async function cancelQueuedOcrJob(
  context: OrgContext,
  jobId: string,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob> {
  const job = await repo.findJob(context.organizationId, jobId);
  if (!job) throw new NotFoundError('OCR extraction job');
  if (!isOcrCancelableStatus(job.status)) {
    throw new DomainRuleError(
      'Only queued jobs can be cancelled',
      'ocr.errors.jobNotCancelable',
    );
  }
  const updated = await repo.claimJob(context.organizationId, jobId, ['queued'], {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  if (!updated) {
    const latest = await repo.findJob(context.organizationId, jobId);
    if (!latest) throw new NotFoundError('OCR extraction job');
    if (!isOcrCancelableStatus(latest.status)) {
      throw new DomainRuleError(
        'Only queued jobs can be cancelled',
        'ocr.errors.jobNotCancelable',
      );
    }
    throw new ConflictError('OCR job was updated concurrently');
  }
  await refreshBatchProgress(context.organizationId, updated.batchId, repo);
  return updated;
}

export { refreshBatchProgress };
