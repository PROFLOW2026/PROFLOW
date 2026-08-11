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
}>;

export interface CreateOcrJobInput {
  readonly organizationId: string;
  readonly documentId?: string | null;
  readonly filename?: string | null;
  readonly mimeType?: string | null;
  readonly providerId: string;
}

export interface SeedOcrFixtureInput {
  readonly organizationId: string;
  readonly candidates: ReceiptExtractionCandidates;
  readonly documentId?: string | null;
  readonly filename?: string | null;
  readonly mimeType?: string | null;
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
  findJob(organizationId: string, jobId: string): Promise<ExtractionJob | null>;
  listJobsForOrg(
    organizationId: string,
    options?: { status?: ExtractionJobStatus | readonly ExtractionJobStatus[] },
  ): Promise<ExtractionJob[]>;
  seedFixtureJob(input: SeedOcrFixtureInput): Promise<ExtractionJob>;
}
