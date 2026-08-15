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
  OcrSourceDocumentRef,
  ReceiptExtractionCandidates,
} from '../domain/types';

export type OcrJobPatch = Partial<{
  status: ExtractionJobStatus;
  reviewStatus: OcrReviewStatus;
  candidates: ReceiptExtractionCandidates | null;
  extractedCandidates: ReceiptExtractionCandidates | null;
  reviewOverrides: OcrReviewOverrides | null;
  acceptedFields: readonly OcrCandidateFieldKey[] | null;
  rejectedFields: readonly OcrCandidateFieldKey[] | null;
  rawMetadata: OcrSafeRawMetadata | null;
  overallConfidence: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  confirmedExpenseId: string | null;
  confirmedVendorBillId: string | null;
  confirmedVendorCreditId: string | null;
  confirmedDraftTarget: OcrDraftTarget | null;
  sourceDocument: OcrSourceDocumentRef;
  documentVersionId: string | null;
  batchId: string | null;
  attemptCount: number;
  lastError: string | null;
  idempotencyKey: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}>;

export interface CreateOcrJobInput {
  readonly organizationId: string;
  readonly documentId?: string | null;
  readonly filename?: string | null;
  readonly mimeType?: string | null;
  readonly providerId: string;
  readonly documentVersionId?: string | null;
  readonly batchId?: string | null;
  readonly idempotencyKey?: string | null;
}

export interface SeedOcrFixtureInput {
  readonly organizationId: string;
  readonly candidates: ReceiptExtractionCandidates;
  readonly documentId?: string | null;
  readonly filename?: string | null;
  readonly mimeType?: string | null;
}

export interface CreateOcrBatchInput {
  readonly organizationId: string;
  readonly createdByUserId?: string | null;
  readonly totalCount?: number;
}

export interface OcrBatchPatch {
  readonly status?: OcrBatchStatus;
  readonly totalCount?: number;
  readonly completedCount?: number;
  readonly failedCount?: number;
}

export interface ListOcrJobsOptions {
  readonly status?: ExtractionJobStatus | readonly ExtractionJobStatus[];
  readonly batchId?: string;
}

/**
 * OCR extraction job persistence port.
 * Production: Drizzle when `OCR_PERSISTENCE_READY`. In-memory = test double only.
 */
export interface OcrRepository {
  createQueuedJob(input: CreateOcrJobInput): Promise<ExtractionJob>;
  updateJob(
    organizationId: string,
    jobId: string,
    patch: OcrJobPatch,
  ): Promise<ExtractionJob | null>;
  /**
   * Compare-and-set: apply patch only when current status is one of `fromStatuses`.
   * Returns null when the job is missing or the status did not match (lost the claim).
   */
  claimJob(
    organizationId: string,
    jobId: string,
    fromStatuses: readonly ExtractionJobStatus[],
    patch: OcrJobPatch,
  ): Promise<ExtractionJob | null>;
  findJob(organizationId: string, jobId: string): Promise<ExtractionJob | null>;
  findActiveJobForDocument(
    organizationId: string,
    documentId: string,
    providerId: string,
  ): Promise<ExtractionJob | null>;
  findJobByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<ExtractionJob | null>;
  listJobsForOrg(organizationId: string, options?: ListOcrJobsOptions): Promise<ExtractionJob[]>;
  seedFixtureJob(input: SeedOcrFixtureInput): Promise<ExtractionJob>;
  createBatch(input: CreateOcrBatchInput): Promise<OcrBatch>;
  updateBatch(
    organizationId: string,
    batchId: string,
    patch: OcrBatchPatch,
  ): Promise<OcrBatch | null>;
  findBatch(organizationId: string, batchId: string): Promise<OcrBatch | null>;
  listBatchesForOrg(organizationId: string): Promise<OcrBatch[]>;
}
