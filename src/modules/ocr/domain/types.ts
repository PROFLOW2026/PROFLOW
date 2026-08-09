/**

 * OCR / document intelligence candidates (doc 27).

 *

 * AI output is never ledger truth — every field is a candidate with confidence

 * and provenance until a human explicitly confirms a mapping into Expense.

 */



/**

 * Fields a reviewer may explicitly accept into an expense draft mapping.

 * `dueDate` is retained for review and may append to notes — Expense has no due_date.

 */

export const OCR_CANDIDATE_FIELD_KEYS = [

  'vendor',

  'date',

  'dueDate',

  'reference',

  'description',

  'net',

  'tax',

  'gross',

  'currency',

] as const;



export type OcrCandidateFieldKey = (typeof OCR_CANDIDATE_FIELD_KEYS)[number];



export const EXTRACTION_JOB_STATUSES = [

  'queued',

  'running',

  'succeeded',

  'failed',

  'needs_review',

] as const;



export type ExtractionJobStatus = (typeof EXTRACTION_JOB_STATUSES)[number];



export type OcrFieldSource = 'ocr' | 'user_override' | 'fixture';



export interface FieldProvenance {

  readonly source: OcrFieldSource;

  readonly providerId?: string;

  readonly model?: string;

  /** ISO-8601 instant when the provider produced the value. */

  readonly extractedAt?: string;

  readonly rawTextSnippet?: string;

}



export interface OcrFieldCandidate {

  /** Proposed value, or null when the provider could not read the field. */

  readonly value: string | null;

  /** 0..1 when the provider reports confidence; null when unknown. */

  readonly confidence: number | null;

  readonly provenance: FieldProvenance;

}



/**

 * Project / category suggestions are labels only — never invented UUIDs and

 * never written to Expense.projectId / costCategoryId by OCR confirm.

 */

export interface OcrNonCanonicalSuggestions {

  readonly projectLabel: OcrFieldCandidate | null;

  readonly categoryLabel: OcrFieldCandidate | null;

}



export interface ReceiptExtractionCandidates {

  readonly vendor: OcrFieldCandidate;

  readonly date: OcrFieldCandidate;

  readonly dueDate: OcrFieldCandidate;

  readonly reference: OcrFieldCandidate;

  readonly description: OcrFieldCandidate;

  readonly net: OcrFieldCandidate;

  readonly tax: OcrFieldCandidate;

  readonly gross: OcrFieldCandidate;

  readonly currency: OcrFieldCandidate;

  /**

   * Line-item text proposals. Never auto-posted; may inform description when

   * the reviewer copies them into the description field.

   */

  readonly lineDescriptions: readonly OcrFieldCandidate[];

  /** Non-canonical targeting hints — display only. */

  readonly suggestions: OcrNonCanonicalSuggestions;

}



/** Retained pointer to the original upload (document module row and/or file meta). */

export interface OcrSourceDocumentRef {

  readonly documentId: string | null;

  readonly filename: string | null;

  readonly mimeType: string | null;

}



/** User corrections retained on the job (overrides win over extracted values). */
export type OcrReviewOverrides = Partial<Record<OcrCandidateFieldKey, string | null>>;

export interface ExtractionJob {
  readonly id: string;
  readonly organizationId: string;
  /** @deprecated Prefer `sourceDocument.documentId` — kept for callers. */
  readonly documentId: string | null;
  readonly sourceDocument: OcrSourceDocumentRef;
  readonly status: ExtractionJobStatus;
  /**
   * Working candidates shown in review (may include user_override provenance).
   * Never ledger truth until explicit confirm creates a draft expense.
   */
  readonly candidates: ReceiptExtractionCandidates | null;
  /**
   * Immutable provider/fixture snapshot. Retained so user edits do not erase
   * original extraction provenance.
   */
  readonly extractedCandidates: ReceiptExtractionCandidates | null;
  /** Retained reviewer corrections keyed by field. */
  readonly reviewOverrides: OcrReviewOverrides | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly providerId: string;
  /** Set only after an explicit confirm that created a draft Expense. */
  readonly confirmedExpenseId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}



export interface OcrProviderStatus {

  readonly providerId: string;

  readonly configured: boolean;

  /** Lookup under `documents.ocr.*` until Lead registers a dedicated `ocr` namespace. */

  readonly messageKey: 'providerNotConfigured' | 'providerConfiguredStub';

}


