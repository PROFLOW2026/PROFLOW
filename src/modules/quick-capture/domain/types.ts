/**
 * Quick Capture Smart Inbox domain types.
 * Capture rows are orchestration only — never financial ledger truth.
 */

export const CAPTURE_STATUSES = [
  'captured',
  'processing',
  'ready_for_review',
  'approved',
  'rejected',
  'archived',
  'failed',
] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const SESSION_KINDS = ['images', 'video', 'pdf', 'file'] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

export const DETECTED_TYPES = [
  'financial_document',
  'field_media',
  'other_document',
  'unknown',
] as const;

export type DetectedType = (typeof DETECTED_TYPES)[number];

export const DETECTION_CONFIDENCES = ['confirmed', 'suggested', 'unknown'] as const;

export type DetectionConfidence = (typeof DETECTION_CONFIDENCES)[number];

export const CAPTURE_SOURCES = ['quick_capture', 'dashboard', 'fab'] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export type NoteProjectHint = {
  readonly projectId: string;
  readonly projectName: string;
  readonly matchedSubstring: string;
};

export type CaptureSuggestionMetadata = {
  readonly provenance?: Record<string, string>;
  readonly noteProjectHints?: readonly NoteProjectHint[];
  readonly byDocument?: Record<
    string,
    {
      readonly mimeType?: string | null;
      readonly inspectionHint?: string | null;
    }
  >;
};

export type CaptureItemRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly createdByUserId: string;
  readonly status: CaptureStatus;
  readonly source: CaptureSource;
  readonly sessionKind: SessionKind;
  readonly documentCount: number;
  readonly ownerNote: string | null;
  readonly explicitProjectId: string | null;
  readonly detectedType: DetectedType | null;
  readonly detectionConfidence: DetectionConfidence | null;
  readonly ownerSelectedType: DetectedType | null;
  readonly suggestedProjectId: string | null;
  readonly suggestedVendorId: string | null;
  readonly suggestionMetadata: CaptureSuggestionMetadata;
  readonly primaryOcrJobId: string | null;
  readonly selectedFinancialDocumentId: string | null;
  readonly routedEntityType: string | null;
  readonly routedEntityId: string | null;
  readonly processingErrorCode: string | null;
  readonly processingErrorMessage: string | null;
  readonly idempotencyKey: string | null;
  readonly capturedAt: string;
  readonly processedAt: string | null;
  readonly reviewedAt: string | null;
  readonly approvedAt: string | null;
  readonly rejectedAt: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CaptureDocumentRecord = {
  readonly id: string;
  readonly quickCaptureItemId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly position: number;
  readonly ocrJobId: string | null;
  readonly createdAt: string;
};

export type SessionFileInput = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

export type PreparedCaptureDocument = {
  readonly documentId: string;
  readonly position: number;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly uploadMode?: 'external' | 'legacy';
  readonly uploadToken?: string | null;
  readonly uploadPath?: string;
  readonly uploadBucket?: string;
};

export type CaptureDocumentDetail = {
  readonly documentId: string;
  readonly position: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

export type SubmitCaptureResult = {
  readonly capture: CaptureItemRecord;
  readonly documents: readonly PreparedCaptureDocument[];
};
