import type { ReceiptExtractionCandidates } from './types';

/**
 * Pluggable OCR provider (doc 27 §4 / doc 32 adapter style).
 *
 * Implementations must not invent financial amounts. A stub without credentials
 * returns a hard failure; a stub with credentials still returns empty — never
 * fabricated receipt fields.
 */

export interface ExtractReceiptInput {
  readonly organizationId: string;
  readonly documentId?: string | null;
  readonly contentBase64?: string;
  readonly mimeType?: string;
  readonly filename?: string;
}

export type ExtractReceiptErrorCode = 'not_configured' | 'provider_error' | 'empty_result';

export type ExtractReceiptResult =
  | {
      readonly ok: true;
      readonly candidates: ReceiptExtractionCandidates;
      /** Always true for financial fields — caller must route to review. */
      readonly needsReview: true;
    }
  | {
      readonly ok: false;
      readonly errorCode: ExtractReceiptErrorCode;
      readonly message: string;
    };

export interface OcrProvider {
  readonly id: string;
  isConfigured(): boolean;
  extractReceipt(input: ExtractReceiptInput): Promise<ExtractReceiptResult>;
}
