import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents/lookups';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { shouldReuseExistingJob } from '../domain/duplicates';
import { OCR_MAX_MANUAL_RETRIES } from '../domain/cost-controls';
import { isOcrActiveProcessingStatus } from '../domain/job-lifecycle';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import type { ExtractionJob, OcrWorkflowContext } from '../domain/types';
import { lookupDocumentCurrentVersionId } from '../data/document-version-lookup';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractReceiptAppInput } from '../validation/schemas';
import { extractReceiptSchema } from '../validation/schemas';
import {
  rememberOcrJobPayload,
  registerOcrJobForWorker,
} from './process-job';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === '23505' ||
    /duplicateActiveJob|duplicateIdempotencyKey|unique/i.test(message)
  );
}

function reused(job: ExtractionJob): ExtractionJob {
  return {
    ...job,
    rawMetadata: {
      ...(job.rawMetadata ?? { providerId: job.providerId }),
      reusedExistingJob: true,
    },
  };
}

/**
 * Enqueue a document extraction job and return immediately.
 *
 * Processing is claimed by a durable worker (`drainDurableOcrQueue`). Tests drain
 * via `flushOcrBackgroundJobs`. Never creates an Expense, Vendor Bill, or Vendor Credit.
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

  let documentVersionId: string | null = null;
  if (input.documentId) {
    const document = await findDocumentById(
      context.db,
      context.organizationId,
      input.documentId,
    );
    if (!document || document.deletedAt || document.status === 'deleted') {
      throw new NotFoundError('Document');
    }
    const fromRecord =
      'currentVersionId' in document
        ? ((document as { currentVersionId?: string | null }).currentVersionId ?? null)
        : null;
    documentVersionId =
      (await lookupDocumentCurrentVersionId(
        context.db,
        context.organizationId,
        input.documentId,
      )) ?? fromRecord;
  }

  if (input.idempotencyKey) {
    const byKey = await repo.findJobByIdempotencyKey(
      context.organizationId,
      input.idempotencyKey,
    );
    if (byKey) {
      if (!input.forceRetry || isOcrActiveProcessingStatus(byKey.status)) {
        spawnIfNeeded(context, byKey, input, provider, repo);
        return reused(byKey);
      }
    }
  }

  if (input.documentId) {
    const active = await repo.findActiveJobForDocument(
      context.organizationId,
      input.documentId,
      provider.id,
    );
    if (active) {
      spawnIfNeeded(context, active, input, provider, repo);
      return reused(active);
    }

    const existing = (await repo.listJobsForOrg(context.organizationId)).filter(
      (job) => job.sourceDocument.documentId === input.documentId && job.providerId === provider.id,
    );
    const reusable = existing.find((job) => shouldReuseExistingJob(job.status));
    if (reusable && !input.forceRetry) {
      spawnIfNeeded(context, reusable, input, provider, repo);
      return reused(reusable);
    }

    const failed = existing.find((job) => job.status === 'failed');
    const retries = failed?.rawMetadata?.manualRetryCount ?? 0;
    if (input.forceRetry && failed && retries >= OCR_MAX_MANUAL_RETRIES) {
      throw new DomainRuleError('Retry limit reached', 'ocr.errors.retryLimit');
    }

    if (input.forceRetry && failed) {
      const queuedRetry = await repo.claimJob(context.organizationId, failed.id, ['failed'], {
        status: 'queued',
        queuedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        lastError: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        candidates: null,
        extractedCandidates: null,
        rawMetadata: {
          ...(failed.rawMetadata ?? { providerId: provider.id }),
          workflow,
          manualRetryCount: retries + 1,
          reusedExistingJob: undefined,
        },
      });
      if (!queuedRetry) {
        throw new ConflictError('OCR job was updated concurrently');
      }
      rememberOcrJobPayload(queuedRetry.id, input);
      registerOcrJobForWorker({ context, jobId: queuedRetry.id, provider, repo });
      return queuedRetry;
    }
  }

  let queued: ExtractionJob;
  try {
    queued = await repo.createQueuedJob({
      organizationId: context.organizationId,
      documentId: input.documentId,
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      providerId: provider.id,
      documentVersionId,
      batchId: input.batchId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    if (isUniqueViolation(error) && input.documentId) {
      const active = await repo.findActiveJobForDocument(
        context.organizationId,
        input.documentId,
        provider.id,
      );
      if (active) {
        spawnIfNeeded(context, active, input, provider, repo);
        return reused(active);
      }
      if (input.idempotencyKey) {
        const byKey = await repo.findJobByIdempotencyKey(
          context.organizationId,
          input.idempotencyKey,
        );
        if (byKey) {
          spawnIfNeeded(context, byKey, input, provider, repo);
          return reused(byKey);
        }
      }
    }
    if (error instanceof ConflictError) {
      if (input.documentId) {
        const active = await repo.findActiveJobForDocument(
          context.organizationId,
          input.documentId,
          provider.id,
        );
        if (active) {
          spawnIfNeeded(context, active, input, provider, repo);
          return reused(active);
        }
      }
    }
    throw error;
  }

  if (workflow !== 'general') {
    await repo.updateJob(context.organizationId, queued.id, {
      rawMetadata: { providerId: provider.id, workflow },
    });
    const withWorkflow = await repo.findJob(context.organizationId, queued.id);
    if (withWorkflow) queued = withWorkflow;
  }

  rememberOcrJobPayload(queued.id, input);
  registerOcrJobForWorker({ context, jobId: queued.id, provider, repo });
  return queued;
}

function spawnIfNeeded(
  context: OrgContext,
  job: ExtractionJob,
  input: ExtractReceiptAppInput,
  provider: OcrProvider,
  repo: OcrRepository,
): void {
  if (job.status !== 'queued') return;
  rememberOcrJobPayload(job.id, input);
  registerOcrJobForWorker({ context, jobId: job.id, provider, repo });
}
