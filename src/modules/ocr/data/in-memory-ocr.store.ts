import { randomUUID } from 'node:crypto';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrReviewOverrides,
  OcrSourceDocumentRef,
  ReceiptExtractionCandidates,
} from '../domain/types';

/**
 * Process-local job store for OCR product flow.
 *
 * Persistence is NOT required for review → confirm → draft expense.
 * If Lead later wants multi-instance durability, propose `0014_ocr_foundations`
 * (see docs/implementation/0014-OCR-FOUNDATIONS-PROPOSAL.md) — do not invent migrations here.
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

export function createQueuedJob(input: {
  organizationId: string;
  documentId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  providerId: string;
}): ExtractionJob {
  const createdAt = nowIso();
  const sourceDocument = sourceRef(input);
  const job: JobRow = {
    id: randomUUID(),
    organizationId: input.organizationId,
    documentId: sourceDocument.documentId,
    sourceDocument,
    status: 'queued',
    candidates: null,
    extractedCandidates: null,
    reviewOverrides: null,
    errorCode: null,
    errorMessage: null,
    providerId: input.providerId,
    confirmedExpenseId: null,
    createdAt,
    updatedAt: createdAt,
  };
  orgBucket(input.organizationId).set(job.id, job);
  return job;
}

export function updateJob(
  organizationId: string,
  jobId: string,
  patch: Partial<{
    status: ExtractionJobStatus;
    candidates: ReceiptExtractionCandidates | null;
    extractedCandidates: ReceiptExtractionCandidates | null;
    reviewOverrides: OcrReviewOverrides | null;
    errorCode: string | null;
    errorMessage: string | null;
    confirmedExpenseId: string | null;
    sourceDocument: OcrSourceDocumentRef;
  }>,
): ExtractionJob | null {
  const bucket = orgBucket(organizationId);
  const existing = bucket.get(jobId);
  if (!existing) return null;
  const sourceDocument = patch.sourceDocument ?? existing.sourceDocument;
  const next: JobRow = {
    ...existing,
    ...patch,
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

export function seedFixtureJob(input: {
  organizationId: string;
  candidates: ReceiptExtractionCandidates;
  documentId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
}): ExtractionJob {
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
    candidates: input.candidates,
    extractedCandidates: input.candidates,
    reviewOverrides: null,
    errorCode: null,
    errorMessage: null,
    providerId: 'fixture',
    confirmedExpenseId: null,
    createdAt,
    updatedAt: createdAt,
  };
  orgBucket(input.organizationId).set(job.id, job);
  return job;
}
