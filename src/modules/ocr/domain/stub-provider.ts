import type { ExtractReceiptInput, ExtractReceiptResult, OcrProvider } from './provider';
import type { ReceiptExtractionCandidates } from './types';
import { emptyCandidates as domainEmptyCandidates } from './field-mapping';

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

  async extractReceipt(_input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    if (!this.configured) {
      return {
        ok: false,
        errorCode: 'not_configured',
        message: 'OCR provider credentials are not configured',
      };
    }

    return {
      ok: false,
      errorCode: 'empty_result',
      message: 'Stub OCR provider does not extract fields; wire a real adapter when credentials exist',
    };
  }

  /** Test helper: empty candidates that still require human review. */
  emptyReviewPayload(): ExtractReceiptResult {
    return {
      ok: true,
      needsReview: true,
      candidates: emptyCandidates(this.id),
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

  async extractReceipt(_input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    return {
      ok: true,
      needsReview: true,
      candidates: this.candidates,
    };
  }
}

export function createDefaultOcrProvider(): OcrProvider {
  return new StubOcrProvider(readOcrApiKey());
}

let defaultProvider: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (!defaultProvider) {
    defaultProvider = createDefaultOcrProvider();
  }
  return defaultProvider;
}

/** Test / DI hook — swap the process-wide provider instance. */
export function setOcrProviderForTests(provider: OcrProvider | null): void {
  defaultProvider = provider;
}
