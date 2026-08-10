/**
 * OCR / document intelligence candidates (doc 27).
 *
 * AI output is never ledger truth — every field is a candidate with confidence
 * and provenance until a human explicitly confirms a mapping into a draft
 * Expense or draft Vendor Bill.
 */

import type { OcrFeatureMode } from './feature-gate';

/**
 * Fields a reviewer may explicitly accept into a draft mapping.
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
  'rejected',
] as const;

export type ExtractionJobStatus = (typeof EXTRACTION_JOB_STATUSES)[number];

/** Human review disposition — independent of provider job progress. */
export const OCR_REVIEW_STATUSES = [
  'awaiting_review',
  'accepted',
  'rejected',
] as const;

export type OcrReviewStatus = (typeof OCR_REVIEW_STATUSES)[number];

/** Explicit confirm target — draft only; never finalized ledger posts. */
export const OCR_DRAFT_TARGETS = ['expense', 'vendor_bill'] as const;

export type OcrDraftTarget = (typeof OCR_DRAFT_TARGETS)[number];

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

/**
 * Safe provider metadata retained for audit/debug.
 * Never store API keys, full document binaries, or unauthorized PII dumps.
 */
export interface OcrSafeRawMetadata {
  readonly providerId: string;
  readonly model?: string;
  readonly requestId?: string;
  readonly pageCount?: number;
  readonly extractedAt?: string;
  readonly overallConfidence?: number | null;
  /** Truncated snippets only (≤200 chars each). */
  readonly textSnippets?: readonly string[];
  readonly fieldConfidences?: Partial<Record<OcrCandidateFieldKey, number | null>>;
  /** Opaque provider status codes / messages safe for operators. */
  readonly providerStatus?: string;
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
  /** Human review disposition. */
  readonly reviewStatus: OcrReviewStatus;
  /**
   * Working candidates shown in review (may include user_override provenance).
   * Never ledger truth until explicit confirm creates a draft.
   */
  readonly candidates: ReceiptExtractionCandidates | null;
  /**
   * Immutable provider/fixture snapshot. Retained so user edits do not erase
   * original extraction provenance.
   */
  readonly extractedCandidates: ReceiptExtractionCandidates | null;
  /** Retained reviewer corrections keyed by field. */
  readonly reviewOverrides: OcrReviewOverrides | null;
  /** Fields explicitly accepted on last confirm/preview. */
  readonly acceptedFields: readonly OcrCandidateFieldKey[] | null;
  /** Fields explicitly rejected by the reviewer (optional disposition). */
  readonly rejectedFields: readonly OcrCandidateFieldKey[] | null;
  /** Safe provider metadata (no secrets). */
  readonly rawMetadata: OcrSafeRawMetadata | null;
  /** Aggregate confidence 0..1 when known. */
  readonly overallConfidence: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly providerId: string;
  /** Set only after an explicit confirm that created a draft Expense. */
  readonly confirmedExpenseId: string | null;
  /** Set only after an explicit confirm that created a draft Vendor Bill. */
  readonly confirmedVendorBillId: string | null;
  /** Last confirmed draft target, when any. */
  readonly confirmedDraftTarget: OcrDraftTarget | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OcrProviderStatus {
  readonly providerId: string;
  readonly configured: boolean;
  readonly featureMode: OcrFeatureMode;
  readonly ingestionEnabled: boolean;
  /** Lookup under `documents.ocr.*` until Lead registers a dedicated `ocr` namespace. */
  readonly messageKey:
    | 'providerNotConfigured'
    | 'providerConfiguredStub'
    | 'providerConfiguredPending'
    | 'featureDisabled'
    | 'providerLiveReady'
    | 'fixtureOnlyMode';
}
