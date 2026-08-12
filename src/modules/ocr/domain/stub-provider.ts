import type { CanonicalOcrDocument } from './canonical';
import type { ExtractReceiptInput, ExtractReceiptResult, OcrProvider } from './provider';
import type { ReceiptExtractionCandidates } from './types';
import { emptyCandidates as domainEmptyCandidates } from './field-mapping';

function canonicalFromCandidates(
  candidates: ReceiptExtractionCandidates,
  providerId: string,
): CanonicalOcrDocument {
  const blank = candidates.vendor;
  return {
    documentTypeKey: 'unknown',
    documentTypeLabel: candidates.documentType,
    supplier: {
      name: candidates.vendor,
      companyNumber: candidates.companyNumber,
      vatId: candidates.vatId,
      address: { value: null, confidence: null, provenance: blank.provenance },
      phone: { value: null, confidence: null, provenance: blank.provenance },
      email: { value: null, confidence: null, provenance: blank.provenance },
    },
    identity: {
      documentNumber: candidates.reference,
      issueDate: candidates.date,
      dueDate: candidates.dueDate,
      orderNumber: candidates.orderNumber,
    },
    money: {
      currency: candidates.currency,
      subtotal: candidates.subtotal,
      discount: candidates.discount,
      net: candidates.net,
      tax: candidates.tax,
      vatRate: candidates.vatRate,
      gross: candidates.gross,
      amountDue: candidates.amountDue,
      vatRates: candidates.vatRate.value ? [candidates.vatRate.value] : [],
    },
    lines: candidates.lines,
    description: candidates.description,
    languages: [],
    pageCount: null,
    overallConfidence: 0.9,
    metadata: { providerId, model: 'scripted-fixture', providerStatus: 'scripted_ok' },
  };
}

function emptyCandidates(providerId: string): ReceiptExtractionCandidates {
  return domainEmptyCandidates({
    source: 'ocr',
    providerId,
    extractedAt: new Date().toISOString(),
  });
}

/**
 * Credential check for the stub only.
 * Uses `OCR_PROVIDER_API_KEY` (server contract). Does not call `serverEnv()` so
 * this module stays importable without pulling `server-only` into client graphs.
 * Legacy `OCR_API_KEY` is intentionally ignored.
 */
function readOcrApiKey(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.OCR_PROVIDER_API_KEY?.trim() || undefined;
}

/**
 * Default provider when no real OCR adapter is wired.
 * Never fabricates receipt fields — returns not_configured or empty_result.
 * Even with a key present, this stub stays non-production and does not fake OCR.
 */
export class StubOcrProvider implements OcrProvider {
  readonly id = 'stub';
  private readonly configured: boolean;

  constructor(configuredOrApiKey: boolean | string | undefined = readOcrApiKey()) {
    if (typeof configuredOrApiKey === 'boolean') {
      this.configured = configuredOrApiKey;
    } else {
      this.configured = Boolean(configuredOrApiKey?.trim());
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async extractDocument(input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    return this.extractReceipt(input);
  }

  async extractReceipt(_input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    if (!this.configured) {
      return {
        ok: false,
        errorCode: 'not_configured',
        message: 'OCR provider credentials are not configured',
        rawMetadata: {
          providerId: this.id,
          providerStatus: 'not_configured',
        },
      };
    }

    return {
      ok: false,
      errorCode: 'empty_result',
      message: 'Stub OCR provider does not extract fields; wire a real adapter when credentials exist',
      rawMetadata: {
        providerId: this.id,
        providerStatus: 'stub_empty',
        extractedAt: new Date().toISOString(),
      },
    };
  }

  /** Test helper: empty candidates that still require human review. */
  emptyReviewPayload(): ExtractReceiptResult {
    const candidates = emptyCandidates(this.id);
    return {
      ok: true,
      needsReview: true,
      candidates,
      canonical: canonicalFromCandidates(candidates, this.id),
      overallConfidence: null,
      rawMetadata: {
        providerId: this.id,
        providerStatus: 'stub_empty_review',
        overallConfidence: null,
      },
    };
  }
}

/**
 * Deterministic provider for unit/integration tests only.
 * Returns fixed candidates with needsReview — never used as the default provider.
 */
export class ScriptedOcrProvider implements OcrProvider {
  readonly id = 'scripted';

  constructor(private readonly candidates: ReceiptExtractionCandidates) {}

  isConfigured(): boolean {
    return true;
  }

  async extractDocument(input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    return this.extractReceipt(input);
  }

  async extractReceipt(_input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    const fieldConfidences = {
      vendor: this.candidates.vendor.confidence,
      date: this.candidates.date.confidence,
      dueDate: this.candidates.dueDate.confidence,
      reference: this.candidates.reference.confidence,
      description: this.candidates.description.confidence,
      net: this.candidates.net.confidence,
      tax: this.candidates.tax.confidence,
      gross: this.candidates.gross.confidence,
      currency: this.candidates.currency.confidence,
    };
    return {
      ok: true,
      needsReview: true,
      candidates: this.candidates,
      canonical: canonicalFromCandidates(this.candidates, this.id),
      overallConfidence: 0.9,
      rawMetadata: {
        providerId: this.id,
        model: 'scripted-fixture',
        overallConfidence: 0.9,
        fieldConfidences,
        extractedAt: new Date().toISOString(),
        providerStatus: 'scripted_ok',
      },
    };
  }
}
