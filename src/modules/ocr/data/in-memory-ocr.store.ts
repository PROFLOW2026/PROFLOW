import { randomUUID } from 'node:crypto';
import { ConflictError } from '@/shared/errors';
import { isOcrActiveProcessingStatus } from '../domain/job-lifecycle';
import { assertOcrConfirmedTargetShape } from '../domain/target-shape';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrBatch,
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrReviewOverrides,
  OcrReviewStatus,
  OcrSafeRawMetadata,
  OcrSourceDocumentRef,
  ReceiptExtractionCandidates,
} from '../domain/types';
import type {
  CreateOcrBatchInput,
  CreateOcrJobInput,
  ListOcrJobsOptions,
  OcrBatchPatch,
  OcrJobPatch,
  OcrRepository,
  SeedOcrFixtureInput,
} from './ocr.repository';

/**
 * Process-local OCR job store - **TEST DOUBLE ONLY**.
 *
 * Not durable across restarts. Production uses Drizzle when
 * `OCR_PERSISTENCE_READY` is true.
 */

type JobRow = ExtractionJob;

const jobsByOrg = new Map<string, Map<string, JobRow>>();
const batchesByOrg = new Map<string, Map<string, OcrBatch>>();

function orgBucket(organizationId: string): Map<string, JobRow> {
  let bucket = jobsByOrg.get(organizationId);
  if (!bucket) {
    bucket = new Map();
    jobsByOrg.set(organizationId, bucket);
  }
  return bucket;
}

function batchBucket(organizationId: string): Map<string, OcrBatch> {
  let bucket = batchesByOrg.get(organizationId);
  if (!bucket) {
    bucket = new Map();
    batchesByOrg.set(organizationId, bucket);
  }
  return bucket;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sourceRef(input: {
  documentId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
}): OcrSourceDocumentRef {
  return {
    documentId: input.documentId ?? null,
    filename: input.filename ?? null,
    mimeType: input.mimeType ?? null,
  };
}

function queueDefaults(createdAt: string): Pick<
  ExtractionJob,
  | 'documentVersionId'
  | 'batchId'
  | 'attemptCount'
  | 'lastError'
  | 'idempotencyKey'
  | 'queuedAt'
  | 'startedAt'
  | 'completedAt'
  | 'cancelledAt'
> {
  return {
    documentVersionId: null,
    batchId: null,
    attemptCount: 0,
    lastError: null,
    idempotencyKey: null,
    queuedAt: createdAt,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
  };
}

function assertActiveUniqueness(organizationId: string, job: ExtractionJob): void {
  const documentId = job.sourceDocument.documentId;
  if (!documentId || !isOcrActiveProcessingStatus(job.status)) return;
  for (const existing of orgBucket(organizationId).values()) {
    if (existing.id === job.id) continue;
    if (
      existing.sourceDocument.documentId === documentId &&
      existing.providerId === job.providerId &&
      isOcrActiveProcessingStatus(existing.status)
    ) {
      throw new ConflictError(
        'An OCR job is already processing this document',
        'ocr.errors.duplicateActiveJob',
      );
    }
  }
}

function assertIdempotencyUniqueness(organizationId: string, job: ExtractionJob): void {
  const key = job.idempotencyKey;
  if (!key) return;
  for (const existing of orgBucket(organizationId).values()) {
    if (existing.id === job.id) continue;
    if (existing.idempotencyKey === key) {
      throw new ConflictError(
        'An OCR job with this idempotency key already exists',
        'ocr.errors.duplicateIdempotencyKey',
      );
    }
  }
}

export function resetOcrStoreForTests(): void {
  jobsByOrg.clear();
  batchesByOrg.clear();
}

export function createInMemoryOcrRepository(): OcrRepository {
  return {
    async createQueuedJob(input: CreateOcrJobInput): Promise<ExtractionJob> {
      return createQueuedJob(input);
    },
    async updateJob(organizationId, jobId, patch) {
      return updateJob(organizationId, jobId, patch);
    },
    async claimJob(organizationId, jobId, fromStatuses, patch) {
      return claimJob(organizationId, jobId, fromStatuses, patch);
    },
    async findJob(organizationId, jobId) {
      return findJob(organizationId, jobId);
    },
    async findActiveJobForDocument(organizationId, documentId, providerId) {
      return findActiveJobForDocument(organizationId, documentId, providerId);
    },
    async findJobByIdempotencyKey(organizationId, idempotencyKey) {
      return findJobByIdempotencyKey(organizationId, idempotencyKey);
    },
    async listJobsForOrg(organizationId, options) {
      return listJobsForOrg(organizationId, options);
    },
    async seedFixtureJob(input) {
      return seedFixtureJob(input);
    },
    async createBatch(input) {
      return createBatch(input);
    },
    async updateBatch(organizationId, batchId, patch) {
      return updateBatch(organizationId, batchId, patch);
    },
    async findBatch(organizationId, batchId) {
      return findBatch(organizationId, batchId);
    },
    async listBatchesForOrg(organizationId) {
      return listBatchesForOrg(organizationId);
    },
  };
}

/** Sync helpers retained for unit tests that call the process-local bucket directly. */

export function createQueuedJob(input: CreateOcrJobInput): ExtractionJob {
  const createdAt = nowIso();
  const sourceDocument = sourceRef(input);
  const job: JobRow = {
    id: randomUUID(),
    organizationId: input.organizationId,
    documentId: sourceDocument.documentId,
    sourceDocument,
    status: 'queued',
    reviewStatus: 'awaiting_review',
    candidates: null,
    extractedCandidates: null,
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: null,
    overallConfidence: null,
    errorCode: null,
    errorMessage: null,
    providerId: input.providerId,
    confirmedExpenseId: null,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
    confirmedDraftTarget: null,
    ...queueDefaults(createdAt),
    documentVersionId: input.documentVersionId ?? null,
    batchId: input.batchId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt,
    updatedAt: createdAt,
  };
  assertActiveUniqueness(input.organizationId, job);
  assertIdempotencyUniqueness(input.organizationId, job);
  orgBucket(input.organizationId).set(job.id, job);
  return job;
}

export function updateJob(
  organizationId: string,
  jobId: string,
  patch: OcrJobPatch,
): ExtractionJob | null {
  const bucket = orgBucket(organizationId);
  const existing = bucket.get(jobId);
  if (!existing) return null;
  const next = applyJobPatch(existing, patch);
  assertActiveUniqueness(organizationId, next);
  assertIdempotencyUniqueness(organizationId, next);
  bucket.set(jobId, next);
  return hydrateJob(next);
}

export function claimJob(
  organizationId: string,
  jobId: string,
  fromStatuses: readonly ExtractionJobStatus[],
  patch: OcrJobPatch,
): ExtractionJob | null {
  const existing = orgBucket(organizationId).get(jobId);
  if (!existing) return null;
  if (!fromStatuses.includes(existing.status)) return null;
  if (
    (patch.confirmedExpenseId != null ||
      patch.confirmedVendorBillId != null ||
      patch.confirmedVendorCreditId != null) &&
    (existing.confirmedExpenseId || existing.confirmedVendorBillId || existing.confirmedVendorCreditId)
  ) {
    return null;
  }
  return updateJob(organizationId, jobId, patch);
}

function applyJobPatch(existing: ExtractionJob, patch: OcrJobPatch): ExtractionJob {
  const sourceDocument = patch.sourceDocument ?? existing.sourceDocument;
  const nextShape = {
    confirmedDraftTarget:
      patch.confirmedDraftTarget !== undefined
        ? patch.confirmedDraftTarget
        : existing.confirmedDraftTarget,
    confirmedExpenseId:
      patch.confirmedExpenseId !== undefined
        ? patch.confirmedExpenseId
        : existing.confirmedExpenseId,
    confirmedVendorBillId:
      patch.confirmedVendorBillId !== undefined
        ? patch.confirmedVendorBillId
        : existing.confirmedVendorBillId,
    confirmedVendorCreditId:
      patch.confirmedVendorCreditId !== undefined
        ? patch.confirmedVendorCreditId
        : existing.confirmedVendorCreditId,
  };
  assertOcrConfirmedTargetShape(nextShape);

  return {
    ...existing,
    ...patch,
    ...nextShape,
    sourceDocument,
    documentId: sourceDocument.documentId,
    updatedAt: nowIso(),
  };
}

function hydrateJob(job: ExtractionJob): ExtractionJob {
  return {
    ...job,
    confirmedVendorCreditId:
      job.confirmedVendorCreditId ?? job.rawMetadata?.confirmedVendorCreditId ?? null,
    confirmedDraftTarget:
      job.confirmedDraftTarget ?? job.rawMetadata?.confirmedApplicationTarget ?? null,
    documentVersionId: job.documentVersionId ?? null,
    batchId: job.batchId ?? null,
    attemptCount: job.attemptCount ?? 0,
    lastError: job.lastError ?? null,
    idempotencyKey: job.idempotencyKey ?? null,
    queuedAt: job.queuedAt ?? job.createdAt,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    cancelledAt: job.cancelledAt ?? null,
  };
}

export function findJob(organizationId: string, jobId: string): ExtractionJob | null {
  const job = orgBucket(organizationId).get(jobId);
  return job ? hydrateJob(job) : null;
}

export function findActiveJobForDocument(
  organizationId: string,
  documentId: string,
  providerId: string,
): ExtractionJob | null {
  for (const job of orgBucket(organizationId).values()) {
    if (
      job.sourceDocument.documentId === documentId &&
      job.providerId === providerId &&
      isOcrActiveProcessingStatus(job.status)
    ) {
      return hydrateJob(job);
    }
  }
  return null;
}

export function findJobByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): ExtractionJob | null {
  for (const job of orgBucket(organizationId).values()) {
    if (job.idempotencyKey === idempotencyKey) return hydrateJob(job);
  }
  return null;
}

export function listJobsForOrg(
  organizationId: string,
  options?: ListOcrJobsOptions,
): ExtractionJob[] {
  const all = [...orgBucket(organizationId).values()];
  const statuses = options?.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  const filtered = all.filter((job) => {
    if (statuses && !statuses.has(job.status)) return false;
    if (options?.batchId && job.batchId !== options.batchId) return false;
    return true;
  });
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(hydrateJob);
}

export function seedFixtureJob(input: SeedOcrFixtureInput): ExtractionJob {
  const createdAt = nowIso();
  const sourceDocument = sourceRef({
    documentId: input.documentId,
    filename: input.filename ?? 'fixture-receipt.pdf',
    mimeType: input.mimeType ?? 'application/pdf',
  });
  const job: JobRow = {
    id: randomUUID(),
    organizationId: input.organizationId,
    documentId: sourceDocument.documentId,
    sourceDocument,
    status: 'needs_review',
    reviewStatus: 'awaiting_review',
    candidates: input.candidates,
    extractedCandidates: input.candidates,
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: {
      providerId: 'fixture',
      model: 'fixture',
      overallConfidence: 0.9,
      providerStatus: 'fixture_seed',
      extractedAt: createdAt,
    },
    overallConfidence: 0.9,
    errorCode: null,
    errorMessage: null,
    providerId: 'fixture',
    confirmedExpenseId: null,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
    confirmedDraftTarget: null,
    ...queueDefaults(createdAt),
    completedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  orgBucket(input.organizationId).set(job.id, job);
  return job;
}

export function createBatch(input: CreateOcrBatchInput): OcrBatch {
  const createdAt = nowIso();
  const batch: OcrBatch = {
    id: randomUUID(),
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId ?? null,
    status: 'queued',
    totalCount: input.totalCount ?? 0,
    completedCount: 0,
    failedCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
  batchBucket(input.organizationId).set(batch.id, batch);
  return batch;
}

export function updateBatch(
  organizationId: string,
  batchId: string,
  patch: OcrBatchPatch,
): OcrBatch | null {
  const bucket = batchBucket(organizationId);
  const existing = bucket.get(batchId);
  if (!existing) return null;
  const next: OcrBatch = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  bucket.set(batchId, next);
  return next;
}

export function findBatch(organizationId: string, batchId: string): OcrBatch | null {
  return batchBucket(organizationId).get(batchId) ?? null;
}

export function listBatchesForOrg(organizationId: string): OcrBatch[] {
  return [...batchBucket(organizationId).values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

// Re-export patch field types used by callers that previously imported from this file.
export type {
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrReviewOverrides,
  OcrReviewStatus,
  OcrSafeRawMetadata,
  OcrSourceDocumentRef,
  ReceiptExtractionCandidates,
};
