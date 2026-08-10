import { randomUUID } from 'node:crypto';
import { assertOcrConfirmedTargetShape } from '../domain/target-shape';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrReviewOverrides,
  OcrReviewStatus,
  OcrSafeRawMetadata,
  OcrSourceDocumentRef,
  ReceiptExtractionCandidates,
} from '../domain/types';
import type {
  CreateOcrJobInput,
  OcrJobPatch,
  OcrRepository,
  SeedOcrFixtureInput,
} from './ocr.repository';

/**
 * Process-local OCR job store — **TEST DOUBLE ONLY**.
 *
 * Not durable across restarts. Production uses Drizzle when
 * `OCR_PERSISTENCE_READY` is true.
 */

type JobRow = ExtractionJob;

const jobsByOrg = new Map<string, Map<string, JobRow>>();

function orgBucket(organizationId: string): Map<string, JobRow> {
  let bucket = jobsByOrg.get(organizationId);
  if (!bucket) {
    bucket = new Map();
    jobsByOrg.set(organizationId, bucket);
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

export function resetOcrStoreForTests(): void {
  jobsByOrg.clear();
}

export function createInMemoryOcrRepository(): OcrRepository {
  return {
    async createQueuedJob(input: CreateOcrJobInput): Promise<ExtractionJob> {
      return createQueuedJob(input);
    },
    async updateJob(organizationId, jobId, patch) {
      return updateJob(organizationId, jobId, patch);
    },
    async findJob(organizationId, jobId) {
      return findJob(organizationId, jobId);
    },
    async listJobsForOrg(organizationId, options) {
      return listJobsForOrg(organizationId, options);
    },
    async seedFixtureJob(input) {
      return seedFixtureJob(input);
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
    confirmedDraftTarget: null,
    createdAt,
    updatedAt: createdAt,
  };
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
  };
  assertOcrConfirmedTargetShape(nextShape);

  const next: JobRow = {
    ...existing,
    ...patch,
    ...nextShape,
    sourceDocument,
    documentId: sourceDocument.documentId,
    updatedAt: nowIso(),
  };
  bucket.set(jobId, next);
  return next;
}

export function findJob(organizationId: string, jobId: string): ExtractionJob | null {
  return orgBucket(organizationId).get(jobId) ?? null;
}

export function listJobsForOrg(
  organizationId: string,
  options?: { status?: ExtractionJobStatus | readonly ExtractionJobStatus[] },
): ExtractionJob[] {
  const all = [...orgBucket(organizationId).values()];
  const statuses = options?.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  const filtered = statuses ? all.filter((job) => statuses.has(job.status)) : all;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    confirmedDraftTarget: null,
    createdAt,
    updatedAt: createdAt,
  };
  orgBucket(input.organizationId).set(job.id, job);
  return job;
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
