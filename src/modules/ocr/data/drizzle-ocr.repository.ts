/**
 * Durable OCR extraction job metadata against `ocr_extraction_jobs`.
 * Used when `OCR_PERSISTENCE_READY` is true (or directly in PGlite tests).
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { ocrBatches, ocrExtractionJobs } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { isOcrActiveProcessingStatus } from '../domain/job-lifecycle';
import { assertOcrConfirmedTargetShape } from '../domain/target-shape';
import { hydrateCandidates } from '../domain/field-mapping';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrBatch,
  OcrBatchStatus,
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrReviewOverrides,
  OcrReviewStatus,
  OcrSafeRawMetadata,
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

function nowIso(): string {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapJob(row: typeof ocrExtractionJobs.$inferSelect): ExtractionJob {
  const documentId = row.documentId ?? null;
  const candidates = hydrateCandidates(
    (row.extractedCandidates as ReceiptExtractionCandidates | null) ?? null,
  );
  const reviewOverrides = (row.reviewOverrides as OcrReviewOverrides | null) ?? null;
  const working = applyOverridesToCandidates(candidates, reviewOverrides);
  const rawMetadata = (row.rawMetadata as OcrSafeRawMetadata | null) ?? null;

  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId,
    sourceDocument: {
      documentId,
      filename: row.sourceFilename ?? null,
      mimeType: row.sourceMimeType ?? null,
    },
    status: row.status as ExtractionJobStatus,
    reviewStatus: row.reviewStatus as OcrReviewStatus,
    candidates: working,
    extractedCandidates: candidates,
    reviewOverrides,
    acceptedFields: (row.acceptedFields as OcrCandidateFieldKey[] | null) ?? null,
    rejectedFields: (row.rejectedFields as OcrCandidateFieldKey[] | null) ?? null,
    rawMetadata,
    overallConfidence: row.overallConfidence != null ? Number(row.overallConfidence) : null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    providerId: row.providerId,
    confirmedExpenseId: row.confirmedExpenseId ?? null,
    confirmedVendorBillId: row.confirmedVendorBillId ?? null,
    confirmedVendorCreditId:
      row.confirmedVendorCreditId ?? rawMetadata?.confirmedVendorCreditId ?? null,
    confirmedDraftTarget:
      (row.confirmedDraftTarget as OcrDraftTarget | null) ??
      rawMetadata?.confirmedApplicationTarget ??
      null,
    documentVersionId: row.documentVersionId ?? null,
    batchId: row.batchId ?? null,
    attemptCount: row.attemptCount ?? 0,
    lastError: row.lastError ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    queuedAt: toIso(row.queuedAt) ?? row.createdAt.toISOString(),
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    cancelledAt: toIso(row.cancelledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBatch(row: typeof ocrBatches.$inferSelect): OcrBatch {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId ?? null,
    status: row.status as OcrBatchStatus,
    totalCount: row.totalCount,
    completedCount: row.completedCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function applyOverridesToCandidates(
  candidates: ReceiptExtractionCandidates | null,
  overrides: OcrReviewOverrides | null,
): ReceiptExtractionCandidates | null {
  if (!candidates) return null;
  if (!overrides || Object.keys(overrides).length === 0) return candidates;
  const next = { ...candidates };
  for (const [key, value] of Object.entries(overrides)) {
    const field = key as keyof ReceiptExtractionCandidates;
    const existing = next[field];
    if (
      existing &&
      typeof existing === 'object' &&
      'value' in existing &&
      field !== 'lineDescriptions' &&
      field !== 'suggestions'
    ) {
      (next as Record<string, unknown>)[field] = {
        ...existing,
        value: value ?? null,
        provenance: { source: 'user_override' as const },
      };
    }
  }
  return next;
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

export function createDrizzleOcrRepository(db: DbExecutor): OcrRepository {
  const repo: OcrRepository = {
    async createQueuedJob(input: CreateOcrJobInput): Promise<ExtractionJob> {
      const now = new Date();
      const [row] = await db
        .insert(ocrExtractionJobs)
        .values({
          organizationId: input.organizationId,
          documentId: input.documentId ?? null,
          sourceFilename: input.filename ?? null,
          sourceMimeType: input.mimeType ?? null,
          status: 'queued',
          reviewStatus: 'awaiting_review',
          providerId: input.providerId,
          extractedCandidates: null,
          reviewOverrides: null,
          acceptedFields: null,
          rejectedFields: null,
          rawMetadata: null,
          overallConfidence: null,
          errorCode: null,
          errorMessage: null,
          confirmedExpenseId: null,
          confirmedVendorBillId: null,
          confirmedVendorCreditId: null,
          confirmedDraftTarget: null,
          documentVersionId: input.documentVersionId ?? null,
          batchId: input.batchId ?? null,
          attemptCount: 0,
          lastError: null,
          idempotencyKey: input.idempotencyKey ?? null,
          queuedAt: now,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapJob(row!);
    },

    async updateJob(organizationId, jobId, patch: OcrJobPatch): Promise<ExtractionJob | null> {
      const existing = await this.findJob(organizationId, jobId);
      if (!existing) return null;
      return persistJobPatch(db, existing, patch);
    },

    async claimJob(organizationId, jobId, fromStatuses, patch): Promise<ExtractionJob | null> {
      const existing = await this.findJob(organizationId, jobId);
      if (!existing) return null;
      if (!fromStatuses.includes(existing.status)) return null;
      const claimed = await persistJobPatch(db, existing, patch, fromStatuses);
      return claimed;
    },

    async findJob(organizationId, jobId): Promise<ExtractionJob | null> {
      const [row] = await db
        .select()
        .from(ocrExtractionJobs)
        .where(
          and(
            eq(ocrExtractionJobs.id, jobId),
            eq(ocrExtractionJobs.organizationId, organizationId),
          ),
        )
        .limit(1);
      return row ? mapJob(row) : null;
    },

    async findActiveJobForDocument(
      organizationId,
      documentId,
      providerId,
    ): Promise<ExtractionJob | null> {
      const rows = await db
        .select()
        .from(ocrExtractionJobs)
        .where(
          and(
            eq(ocrExtractionJobs.organizationId, organizationId),
            eq(ocrExtractionJobs.documentId, documentId),
            eq(ocrExtractionJobs.providerId, providerId),
          ),
        );
      const active = rows.find((row) => isOcrActiveProcessingStatus(row.status));
      return active ? mapJob(active) : null;
    },

    async findJobByIdempotencyKey(organizationId, idempotencyKey): Promise<ExtractionJob | null> {
      const [row] = await db
        .select()
        .from(ocrExtractionJobs)
        .where(
          and(
            eq(ocrExtractionJobs.organizationId, organizationId),
            eq(ocrExtractionJobs.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return row ? mapJob(row) : null;
    },

    async listJobsForOrg(organizationId, options?: ListOcrJobsOptions): Promise<ExtractionJob[]> {
      const statuses = options?.status
        ? Array.isArray(options.status)
          ? [...options.status]
          : [options.status]
        : null;

      const filters = [eq(ocrExtractionJobs.organizationId, organizationId)];
      if (statuses) filters.push(inArray(ocrExtractionJobs.status, statuses));
      if (options?.batchId) filters.push(eq(ocrExtractionJobs.batchId, options.batchId));

      const rows = await db
        .select()
        .from(ocrExtractionJobs)
        .where(and(...filters))
        .orderBy(desc(ocrExtractionJobs.updatedAt));

      return rows.map(mapJob);
    },

    async seedFixtureJob(input: SeedOcrFixtureInput): Promise<ExtractionJob> {
      const now = new Date();
      const [row] = await db
        .insert(ocrExtractionJobs)
        .values({
          organizationId: input.organizationId,
          documentId: input.documentId ?? null,
          sourceFilename: input.filename ?? 'fixture-receipt.pdf',
          sourceMimeType: input.mimeType ?? 'application/pdf',
          status: 'needs_review',
          reviewStatus: 'awaiting_review',
          providerId: 'fixture',
          extractedCandidates: input.candidates,
          reviewOverrides: null,
          acceptedFields: null,
          rejectedFields: null,
          rawMetadata: {
            providerId: 'fixture',
            model: 'fixture',
            overallConfidence: 0.9,
            providerStatus: 'fixture_seed',
            extractedAt: nowIso(),
          },
          overallConfidence: '0.9',
          errorCode: null,
          errorMessage: null,
          confirmedExpenseId: null,
          confirmedVendorBillId: null,
          confirmedVendorCreditId: null,
          confirmedDraftTarget: null,
          documentVersionId: null,
          batchId: null,
          attemptCount: 0,
          lastError: null,
          idempotencyKey: null,
          queuedAt: now,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapJob(row!);
    },

    async createBatch(input: CreateOcrBatchInput): Promise<OcrBatch> {
      const now = new Date();
      const [row] = await db
        .insert(ocrBatches)
        .values({
          organizationId: input.organizationId,
          createdByUserId: input.createdByUserId ?? null,
          status: 'queued',
          totalCount: input.totalCount ?? 0,
          completedCount: 0,
          failedCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapBatch(row!);
    },

    async updateBatch(
      organizationId,
      batchId,
      patch: OcrBatchPatch,
    ): Promise<OcrBatch | null> {
      const existing = await this.findBatch(organizationId, batchId);
      if (!existing) return null;
      const [row] = await db
        .update(ocrBatches)
        .set({
          status: patch.status ?? existing.status,
          totalCount: patch.totalCount ?? existing.totalCount,
          completedCount: patch.completedCount ?? existing.completedCount,
          failedCount: patch.failedCount ?? existing.failedCount,
          updatedAt: new Date(),
        })
        .where(and(eq(ocrBatches.id, batchId), eq(ocrBatches.organizationId, organizationId)))
        .returning();
      return row ? mapBatch(row) : null;
    },

    async findBatch(organizationId, batchId): Promise<OcrBatch | null> {
      const [row] = await db
        .select()
        .from(ocrBatches)
        .where(and(eq(ocrBatches.id, batchId), eq(ocrBatches.organizationId, organizationId)))
        .limit(1);
      return row ? mapBatch(row) : null;
    },

    async listBatchesForOrg(organizationId): Promise<OcrBatch[]> {
      const rows = await db
        .select()
        .from(ocrBatches)
        .where(eq(ocrBatches.organizationId, organizationId))
        .orderBy(desc(ocrBatches.updatedAt));
      return rows.map(mapBatch);
    },
  };

  return repo;
}

async function persistJobPatch(
  db: DbExecutor,
  existing: ExtractionJob,
  patch: OcrJobPatch,
  fromStatuses?: readonly ExtractionJobStatus[],
): Promise<ExtractionJob | null> {
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

  const extractedCandidates =
    patch.extractedCandidates !== undefined
      ? patch.extractedCandidates
      : existing.extractedCandidates;
  const storedExtracted =
    patch.extractedCandidates !== undefined
      ? patch.extractedCandidates
      : patch.candidates !== undefined && existing.extractedCandidates == null
        ? patch.candidates
        : extractedCandidates;

  const filters = [
    eq(ocrExtractionJobs.id, existing.id),
    eq(ocrExtractionJobs.organizationId, existing.organizationId),
  ];
  if (fromStatuses && fromStatuses.length > 0) {
    filters.push(inArray(ocrExtractionJobs.status, [...fromStatuses]));
  }
  const confirmingTarget =
    patch.confirmedExpenseId != null ||
    patch.confirmedVendorBillId != null ||
    patch.confirmedVendorCreditId != null;
  if (confirmingTarget) {
    filters.push(isNull(ocrExtractionJobs.confirmedExpenseId));
    filters.push(isNull(ocrExtractionJobs.confirmedVendorBillId));
    filters.push(isNull(ocrExtractionJobs.confirmedVendorCreditId));
  }

  const [row] = await db
    .update(ocrExtractionJobs)
    .set({
      status: patch.status ?? existing.status,
      reviewStatus: patch.reviewStatus ?? existing.reviewStatus,
      documentId: sourceDocument.documentId,
      sourceFilename: sourceDocument.filename,
      sourceMimeType: sourceDocument.mimeType,
      extractedCandidates: storedExtracted,
      reviewOverrides:
        patch.reviewOverrides !== undefined ? patch.reviewOverrides : existing.reviewOverrides,
      acceptedFields: patch.acceptedFields !== undefined ? patch.acceptedFields : existing.acceptedFields,
      rejectedFields: patch.rejectedFields !== undefined ? patch.rejectedFields : existing.rejectedFields,
      rawMetadata: patch.rawMetadata !== undefined ? patch.rawMetadata : existing.rawMetadata,
      overallConfidence:
        patch.overallConfidence !== undefined
          ? patch.overallConfidence != null
            ? String(patch.overallConfidence)
            : null
          : existing.overallConfidence != null
            ? String(existing.overallConfidence)
            : null,
      errorCode: patch.errorCode !== undefined ? patch.errorCode : existing.errorCode,
      errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
      confirmedExpenseId: nextShape.confirmedExpenseId,
      confirmedVendorBillId: nextShape.confirmedVendorBillId,
      confirmedVendorCreditId: nextShape.confirmedVendorCreditId,
      confirmedDraftTarget: nextShape.confirmedDraftTarget,
      documentVersionId:
        patch.documentVersionId !== undefined ? patch.documentVersionId : existing.documentVersionId,
      batchId: patch.batchId !== undefined ? patch.batchId : existing.batchId,
      attemptCount: patch.attemptCount !== undefined ? patch.attemptCount : existing.attemptCount,
      lastError: patch.lastError !== undefined ? patch.lastError : existing.lastError,
      idempotencyKey:
        patch.idempotencyKey !== undefined ? patch.idempotencyKey : existing.idempotencyKey,
      queuedAt:
        patch.queuedAt !== undefined ? asDate(patch.queuedAt) : asDate(existing.queuedAt),
      startedAt:
        patch.startedAt !== undefined ? asDate(patch.startedAt) : asDate(existing.startedAt),
      completedAt:
        patch.completedAt !== undefined ? asDate(patch.completedAt) : asDate(existing.completedAt),
      cancelledAt:
        patch.cancelledAt !== undefined ? asDate(patch.cancelledAt) : asDate(existing.cancelledAt),
      ...(fromStatuses && (patch.status === 'processing' || patch.status === 'running')
        ? {
            claimedAt: new Date(),
            claimedBy: 'app-claim',
            leaseExpiresAt: new Date(Date.now() + 600_000),
            heartbeatAt: new Date(),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(...filters))
    .returning();

  if (!row) return null;
  const mapped = mapJob(row);
  if (patch.candidates !== undefined) {
    return { ...mapped, candidates: patch.candidates };
  }
  return mapped;
}
