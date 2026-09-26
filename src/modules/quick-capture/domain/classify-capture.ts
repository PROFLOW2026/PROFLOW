import type { ExtractionJob } from '@/modules/ocr';
import type { OcrDocumentTypeKey } from '@/modules/ocr/domain/types';
import type {
  CaptureSuggestionMetadata,
  DetectionConfidence,
  DetectedType,
  SessionKind,
} from './types';
import { extractNoteProjectHints } from './note-project-hints';
import { isVideoMimeType } from './video-mime';

const FINANCIAL_DOCUMENT_TYPE_KEYS = new Set<OcrDocumentTypeKey>([
  'receipt',
  'tax_invoice',
  'vendor_invoice',
  'transaction_invoice',
  'tax_invoice_receipt',
  'credit_note',
]);

export type ClassifyCaptureInput = {
  readonly sessionKind: SessionKind;
  readonly documentCount: number;
  readonly mimeTypes: readonly string[];
  readonly explicitProjectId: string | null;
  readonly ownerNote: string | null;
  readonly ocrJob: ExtractionJob | null;
  readonly projectNames: readonly { readonly id: string; readonly name: string }[];
};

export type ClassifyCaptureResult = {
  readonly detectedType: DetectedType;
  readonly detectionConfidence: DetectionConfidence;
  readonly suggestedProjectId: string | null;
  readonly suggestedVendorId: string | null;
  readonly suggestionMetadata: CaptureSuggestionMetadata;
};

function isImageMime(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith('image/');
}

function allImageMimes(mimeTypes: readonly string[]): boolean {
  return mimeTypes.length > 0 && mimeTypes.every(isImageMime);
}

function ocrDocumentTypeKey(job: ExtractionJob | null): OcrDocumentTypeKey | null {
  const key = job?.rawMetadata?.documentTypeKey;
  return typeof key === 'string' ? (key as OcrDocumentTypeKey) : null;
}

function ocrHasStrongFinancialSignal(job: ExtractionJob | null): boolean {
  if (!job?.candidates) return false;
  const vendor = job.candidates.vendor?.value?.trim();
  const reference = job.candidates.reference?.value?.trim();
  const gross = job.candidates.gross?.value?.trim();
  const net = job.candidates.net?.value?.trim();
  return Boolean(vendor && (reference || gross || net));
}

function ocrSucceeded(job: ExtractionJob | null): boolean {
  return job?.status === 'needs_review' || job?.status === 'succeeded';
}

/**
 * Deterministic v1 classification — no new AI engine.
 */
export function classifyCapture(input: ClassifyCaptureInput): ClassifyCaptureResult {
  const noteHints = extractNoteProjectHints(input.ownerNote, input.projectNames);
  const suggestionMetadata: CaptureSuggestionMetadata = {
    noteProjectHints: noteHints,
    provenance: input.explicitProjectId ? { project: 'confirmed_structured' } : {},
  };

  const suggestedProjectId =
    input.explicitProjectId ?? noteHints[0]?.projectId ?? null;
  const suggestedVendorId: string | null = null;

  if (input.sessionKind === 'video' || input.mimeTypes.some((mime) => isVideoMimeType(mime))) {
    return {
      detectedType: 'field_media',
      detectionConfidence: 'suggested',
      suggestedProjectId,
      suggestedVendorId: null,
      suggestionMetadata,
    };
  }

  if (input.documentCount >= 2 && allImageMimes(input.mimeTypes)) {
    return {
      detectedType: 'field_media',
      detectionConfidence: 'suggested',
      suggestedProjectId,
      suggestedVendorId: null,
      suggestionMetadata,
    };
  }

  if (input.documentCount === 1 && ocrSucceeded(input.ocrJob)) {
    const documentTypeKey = ocrDocumentTypeKey(input.ocrJob);
    if (documentTypeKey && FINANCIAL_DOCUMENT_TYPE_KEYS.has(documentTypeKey)) {
      return {
        detectedType: 'financial_document',
        detectionConfidence: 'suggested',
        suggestedProjectId,
        suggestedVendorId,
        suggestionMetadata,
      };
    }
    if (ocrHasStrongFinancialSignal(input.ocrJob)) {
      return {
        detectedType: 'financial_document',
        detectionConfidence: 'suggested',
        suggestedProjectId,
        suggestedVendorId,
        suggestionMetadata,
      };
    }
  }

  if (
    input.documentCount === 1 &&
    input.mimeTypes.length === 1 &&
    isImageMime(input.mimeTypes[0]!) &&
    (input.explicitProjectId || noteHints.length > 0)
  ) {
    return {
      detectedType: 'field_media',
      detectionConfidence: 'suggested',
      suggestedProjectId,
      suggestedVendorId: null,
      suggestionMetadata,
    };
  }

  if (input.documentCount === 1) {
    return {
      detectedType: 'other_document',
      detectionConfidence: 'unknown',
      suggestedProjectId,
      suggestedVendorId: null,
      suggestionMetadata,
    };
  }

  return {
    detectedType: 'unknown',
    detectionConfidence: 'unknown',
    suggestedProjectId,
    suggestedVendorId: null,
    suggestionMetadata,
  };
}
