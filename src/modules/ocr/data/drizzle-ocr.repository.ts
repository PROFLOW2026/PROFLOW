/**
 * Durable OCR extraction job metadata against `ocr_extraction_jobs`.
 * Used when `OCR_PERSISTENCE_READY` is true (or directly in PGlite tests).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { ocrExtractionJobs } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { assertOcrConfirmedTargetShape } from '../domain/target-shape';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrReviewOverrides,
  OcrReviewStatus,
  OcrSafeRawMetadata,
  ReceiptExtractionCandidates,
} from '../domain/types';
import type {
  CreateOcrJobInput,
  OcrJobPatch,
  OcrRepository,
  SeedOcrFixtureInput,
} from './ocr.repository';

function nowIso(): string {
  return new Date().toISOString();
}

function mapJob(row: typeof ocrExtractionJobs.$inferSelect): ExtractionJob {
  const documentId = row.documentId ?? null;
  const candidates = (row.extractedCandidates as ReceiptExtractionCandidates | null) ?? null;
  const reviewOverrides = (row.reviewOverrides as OcrReviewOverrides | null) ?? null;
  // Working candidates: apply overrides in app layer when loading if needed;
  // we store extracted snapshot in extracted_candidates and overrides separately.
  // For review UX, prefer candidates derived from extracted + overrides when present.
  const working = applyOverridesToCandidates(candidates, reviewOverrides);

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
    rawMetadata: (row.rawMetadata as OcrSafeRawMetadata | null) ?? null,
    overallConfidence: row.overallConfidence != null ? Number(row.overallConfidence) : null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    providerId: row.providerId,
    confirmedExpenseId: row.confirmedExpenseId ?? null,
    confirmedVendorBillId: row.confirmedVendorBillId ?? null,
    confirmedDraftTarget: (row.confirmedDraftTarget as OcrDraftTarget | null) ?? null,
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

export function createDrizzleOcrRepository(db: DbExecutor): OcrRepository {
  return {
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
          confirmedDraftTarget: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapJob(row!);
    },

    async updateJob(organizationId, jobId, patch: OcrJobPatch): Promise<ExtractionJob | null> {
      const existing = await this.findJob(organizationId, jobId);
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

      const extractedCandidates =
        patch.extractedCandidates !== undefined
          ? patch.extractedCandidates
          : existing.extractedCandidates;
      // Prefer explicit candidates patch as working set for extracted when provided
      // without a separate extracted snapshot.
      const storedExtracted =
        patch.extractedCandidates !== undefined
          ? patch.extractedCandidates
          : patch.candidates !== undefined && existing.extractedCandidates == null
            ? patch.candidates
            : extractedCandidates;

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
            patch.reviewOverrides !== undefined
              ? patch.reviewOverrides
              : existing.reviewOverrides,
          acceptedFields:
            patch.acceptedFields !== undefined ? patch.acceptedFields : existing.acceptedFields,
          rejectedFields:
            patch.rejectedFields !== undefined ? patch.rejectedFields : existing.rejectedFields,
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
          errorMessage:
            patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
          confirmedExpenseId: nextShape.confirmedExpenseId,
          confirmedVendorBillId: nextShape.confirmedVendorBillId,
          confirmedDraftTarget: nextShape.confirmedDraftTarget,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ocrExtractionJobs.id, jobId),
            eq(ocrExtractionJobs.organizationId, organizationId),
          ),
        )
        .returning();

      if (!row) return null;
      const mapped = mapJob(row);
      // When callers pass working `candidates` with overrides already applied,
      // surface them (DB only stores extracted + overrides).
      if (patch.candidates !== undefined) {
        return { ...mapped, candidates: patch.candidates };
      }
      return mapped;
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

    async listJobsForOrg(organizationId, options): Promise<ExtractionJob[]> {
      const statuses = options?.status
        ? Array.isArray(options.status)
          ? [...options.status]
          : [options.status]
        : null;

      const rows = statuses
        ? await db
            .select()
            .from(ocrExtractionJobs)
            .where(
              and(
                eq(ocrExtractionJobs.organizationId, organizationId),
                inArray(ocrExtractionJobs.status, statuses),
              ),
            )
            .orderBy(desc(ocrExtractionJobs.updatedAt))
        : await db
            .select()
            .from(ocrExtractionJobs)
            .where(eq(ocrExtractionJobs.organizationId, organizationId))
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
          confirmedDraftTarget: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapJob(row!);
    },
  };
}
