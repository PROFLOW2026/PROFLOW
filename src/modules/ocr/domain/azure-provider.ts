import { AZURE_OCR_LIVE_HTTP_READY } from './feature-gate';
import type { ExtractReceiptInput, ExtractReceiptResult, OcrProvider } from './provider';

/**
 * Azure Document Intelligence adapter skeleton.
 *
 * Required env (server only — never NEXT_PUBLIC_*):
 * - OCR_PROVIDER=azure
 * - OCR_PROVIDER_API_KEY=<Azure DI key>
 * - OCR_PROVIDER_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
 * - OCR_PROVIDER_MODEL=prebuilt-receipt (optional; default prebuilt-receipt)
 * - OCR_INGESTION_ENABLED=true
 *
 * Until a full HTTP analyze+poll path is wired (`AZURE_OCR_LIVE_HTTP_READY`),
 * configured instances return empty_result — never fabricated amounts — and
 * feature mode stays `configured_pending` (never `live` / providerLiveReady).
 */
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  readonly id = 'azure';
  private readonly apiKey: string | undefined;
  private readonly endpoint: string | undefined;
  private readonly model: string;

  constructor(options?: {
    readonly apiKey?: string;
    readonly endpoint?: string;
    readonly model?: string;
  }) {
    this.apiKey =
      options?.apiKey?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_API_KEY?.trim() : undefined) ||
      undefined;
    this.endpoint =
      options?.endpoint?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_ENDPOINT?.trim() : undefined) ||
      undefined;
    this.model =
      options?.model?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_MODEL?.trim() : undefined) ||
      'prebuilt-receipt';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.endpoint);
  }

  async extractReceipt(_input: ExtractReceiptInput): Promise<ExtractReceiptResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        errorCode: 'not_configured',
        message: 'Azure Document Intelligence credentials are not configured',
        rawMetadata: {
          providerId: this.id,
          model: this.model,
          providerStatus: 'not_configured',
        },
      };
    }

    if (!AZURE_OCR_LIVE_HTTP_READY) {
      // Skeleton: credentials may be present, but analyze+poll is not wired.
      // Callers must treat this as configured_pending — never live-ready.
      return {
        ok: false,
        errorCode: 'empty_result',
        message:
          'Azure OCR adapter is configured but live extraction is not wired in this build; no fields invented',
        rawMetadata: {
          providerId: this.id,
          model: this.model,
          providerStatus: 'adapter_pending_live_http',
          extractedAt: new Date().toISOString(),
        },
      };
    }

    // Reserved for the verified HTTP analyze+poll path.
    return {
      ok: false,
      errorCode: 'empty_result',
      message:
        'Azure OCR live HTTP path flag is on but analyze+poll is not implemented yet',
      rawMetadata: {
        providerId: this.id,
        model: this.model,
        providerStatus: 'adapter_pending_live_http',
        extractedAt: new Date().toISOString(),
      },
    };
  }
}
