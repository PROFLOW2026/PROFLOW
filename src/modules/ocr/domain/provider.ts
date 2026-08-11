import type { CanonicalOcrDocument } from './canonical';
import type {
  OcrSafeRawMetadata,
  OcrWorkflowContext,
  ReceiptExtractionCandidates,
} from './types';

/**
 * Pluggable OCR provider (doc 27 §4 / doc 32 adapter style).
 *
 * Implementations must not invent financial amounts. A stub without credentials
 * returns a hard failure; a stub with credentials still returns empty — never
 * fabricated receipt fields. Providers never create financial entities.
 */

export interface ExtractDocumentInput {
  readonly organizationId: string;
  readonly documentId?: string | null;
  readonly bytes?: Uint8Array;
  readonly contentBase64?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly workflow?: OcrWorkflowContext;
  readonly locale?: string;
}

/** @deprecated Use ExtractDocumentInput. Kept for existing callers/tests. */
export type ExtractReceiptInput = ExtractDocumentInput;

export type ExtractReceiptErrorCode =
  | 'not_configured'
  | 'provider_error'
  | 'empty_result'
  | 'feature_disabled'
  | 'unsupported_file'
  | 'timeout'
  | 'too_large'
  | 'too_many_pages';

export type ExtractDocumentResult =
  | {
      readonly ok: true;
      readonly candidates: ReceiptExtractionCandidates;
      readonly canonical: CanonicalOcrDocument;
      /** Always true for financial fields — caller must route to review. */
      readonly needsReview: true;
      readonly rawMetadata?: OcrSafeRawMetadata;
      readonly overallConfidence?: number | null;
    }
  | {
      readonly ok: false;
      readonly errorCode: ExtractReceiptErrorCode;
      readonly message: string;
      readonly rawMetadata?: OcrSafeRawMetadata;
    };

/** @deprecated Use ExtractDocumentResult. */
export type ExtractReceiptResult = ExtractDocumentResult;

export interface OcrProvider {
  readonly id: string;
  isConfigured(): boolean;
  extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult>;
  /** Alias used by existing tests — must call extractDocument. */
  extractReceipt(input: ExtractReceiptInput): Promise<ExtractReceiptResult>;
}
