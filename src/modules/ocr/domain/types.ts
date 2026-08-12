/**
 * OCR / document intelligence candidates (doc 27).
 *
 * AI output is never ledger truth — every field is a candidate with confidence
 * and provenance until a human explicitly confirms a mapping into a draft
 * Expense, draft Vendor Bill, or draft Vendor Credit.
 *
 * Provider-specific field names (Azure VendorName, InvoiceId, …) must not appear
 * outside adapter mappers. This file is the canonical ProjectFlow contract.
 */

import type { OcrFeatureMode } from './feature-gate';

/**
 * Fields a reviewer may explicitly accept into a draft mapping.
 * Extra identity fields persist in JSON on `ocr_extraction_jobs` (no migration).
 * `dueDate` / `orderNumber` may append to expense notes — Expense has no those columns.
 */
export const OCR_CANDIDATE_FIELD_KEYS = [
  'vendor',
  'companyNumber',
  'vatId',
  'date',
  'dueDate',
  'reference',
  'orderNumber',
  'documentType',
  'description',
  'subtotal',
  'discount',
  'net',
  'tax',
  'vatRate',
  'gross',
  'amountDue',
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

/**
 * Explicit confirm target — draft only; never finalized ledger posts.
 * `vendor_credit` is a first-class confirmed draft target (0031).
 */
export const OCR_DRAFT_TARGETS = ['expense', 'vendor_bill', 'vendor_credit'] as const;

export type OcrDraftTarget = (typeof OCR_DRAFT_TARGETS)[number];

/** Where the user started capture — drives default target + model strategy. */
export const OCR_WORKFLOW_CONTEXTS = [
  'expense',
  'vendor_bill',
  'vendor_credit',
  'general',
] as const;

export type OcrWorkflowContext = (typeof OCR_WORKFLOW_CONTEXTS)[number];

export const OCR_PROVIDER_IDS = ['azure', 'google', 'aws', 'stub', 'scripted', 'fixture'] as const;

export type OcrProviderId = (typeof OCR_PROVIDER_IDS)[number];

export const OCR_DOCUMENT_TYPE_KEYS = [
  'tax_invoice',
  'receipt',
  'tax_invoice_receipt',
  'transaction_invoice',
  'vendor_invoice',
  'credit_note',
  'unknown',
] as const;

export type OcrDocumentTypeKey = (typeof OCR_DOCUMENT_TYPE_KEYS)[number];

export type OcrFieldSource = 'ocr' | 'user_override' | 'fixture';

/** How a value was obtained — used for trust hierarchy in review. */
export type OcrExtractionMethod =
  | 'structured'
  | 'hebrew_labeled'
  | 'kv'
  | 'reconciled'
  | 'heuristic';

export type OcrConfidenceState = 'high' | 'uncertain' | 'not_detected';

export interface FieldProvenance {
  readonly source: OcrFieldSource;
  readonly providerId?: string;
  readonly model?: string;
  /** ISO-8601 instant when the provider produced the value. */
  readonly extractedAt?: string;
  readonly rawTextSnippet?: string;
  /** Trust signal: structured Azure > labeled Hebrew fallback > weak heuristic. */
  readonly extractionMethod?: OcrExtractionMethod;
}

export interface OcrFieldCandidate {
  /** Proposed value, or null when the provider could not read the field. */
  readonly value: string | null;
  /** 0..1 when the provider reports confidence; null when unknown. */
  readonly confidence: number | null;
  readonly provenance: FieldProvenance;
}

export interface OcrLineItemCandidate {
  readonly description: OcrFieldCandidate;
  readonly quantity: OcrFieldCandidate;
  readonly unit: OcrFieldCandidate;
  readonly unitPrice: OcrFieldCandidate;
  /** Line amount before tax when distinguishable; otherwise the provider Amount. */
  readonly netAmount: OcrFieldCandidate;
  readonly taxAmount: OcrFieldCandidate;
  /**
   * Inclusive line total when tax is known separately; otherwise null when it
   * would only duplicate netAmount (never copy Amount into both blindly).
   */
  readonly lineTotal: OcrFieldCandidate;
  readonly productCode?: OcrFieldCandidate;
  readonly taxRate?: OcrFieldCandidate;
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
  readonly companyNumber: OcrFieldCandidate;
  readonly vatId: OcrFieldCandidate;
  readonly date: OcrFieldCandidate;
  readonly dueDate: OcrFieldCandidate;
  readonly reference: OcrFieldCandidate;
  readonly orderNumber: OcrFieldCandidate;
  readonly documentType: OcrFieldCandidate;
  readonly description: OcrFieldCandidate;
  /** Subtotal before document-level discount (Azure SubTotal). */
  readonly subtotal: OcrFieldCandidate;
  /** Document-level discount amount (Azure TotalDiscount). */
  readonly discount: OcrFieldCandidate;
  /** Taxable amount before VAT (after discounts). */
  readonly net: OcrFieldCandidate;
  readonly tax: OcrFieldCandidate;
  /** Explicit VAT rate from TaxDetails / labeled text (e.g. "18"). */
  readonly vatRate: OcrFieldCandidate;
  /** Invoice total including VAT — never copied from subtotal. */
  readonly gross: OcrFieldCandidate;
  /** Amount due when distinct from invoice total. */
  readonly amountDue: OcrFieldCandidate;
  readonly currency: OcrFieldCandidate;
  /**
   * Line-item text proposals. Never auto-posted; may inform description when
   * the reviewer copies them into the description field.
   */
  readonly lineDescriptions: readonly OcrFieldCandidate[];
  /** Structured lines when the provider returned them. */
  readonly lines: readonly OcrLineItemCandidate[];
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
  readonly workflow?: OcrWorkflowContext;
  readonly modelStrategy?: 'receipt' | 'invoice';
  readonly languages?: readonly string[];
  readonly vatRates?: readonly string[];
  readonly checksumSha256?: string;
  readonly durationMs?: number;
  readonly manualRetryCount?: number;
  readonly reusedExistingJob?: boolean;
  /** Legacy mirror only — prefer confirmed_vendor_credit_id column (0031). */
  readonly confirmedVendorCreditId?: string;
  readonly confirmedApplicationTarget?: OcrDraftTarget;
  readonly documentTypeKey?: OcrDocumentTypeKey;
  /** Customer party when distinct from supplier — review only, never auto-applied. */
  readonly customer?: {
    readonly name?: string | null;
    readonly taxId?: string | null;
    readonly customerId?: string | null;
  };
  readonly paymentTerm?: string | null;
  /** Document-level TaxDetails from Azure when present. */
  readonly taxDetails?: readonly {
    readonly rate: string | null;
    readonly amount: string | null;
    readonly taxableAmount: string | null;
  }[];
  readonly errorCategory?: string;
  readonly vendorMatches?: readonly OcrVendorMatch[];
  readonly duplicateHits?: readonly OcrDuplicateHit[];
  readonly azureTier?: 'F0' | 'S0' | 'unlimited' | 'unknown';
  readonly maxPages?: number;
  readonly maxFileBytes?: number;
  readonly queryFieldsEnabled?: boolean;
  readonly queryFieldsRequested?: boolean;
  readonly keyValuePairsRequested?: boolean;
  readonly hebrewNativePrebuilt?: boolean;
  readonly providerCapabilities?: {
    readonly tier: 'F0' | 'S0' | 'unlimited' | 'unknown';
    readonly maxFileBytes: number;
    readonly maxPages: number;
    readonly queryFields: boolean;
    readonly queryFieldsCostNote: string | null;
  };
}

export interface OcrVendorMatch {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly strength: 'exact_identifier' | 'exact_name' | 'probable_name';
  readonly reasonKey: 'identifier' | 'exactName' | 'probableName';
}

export interface OcrDuplicateHit {
  readonly kind: 'exact_file' | 'probable_document';
  readonly reasonKeys: readonly string[];
  readonly expenseId?: string;
  readonly vendorBillId?: string;
  readonly documentId?: string;
  readonly jobId?: string;
}

export interface OcrReviewWarning {
  readonly code: string;
  readonly messageKey: string;
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
  /** Set only after an explicit confirm that created a draft Vendor Credit. */
  readonly confirmedVendorCreditId: string | null;
  /** Last confirmed draft target, when any. Credit is application-only. */
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
