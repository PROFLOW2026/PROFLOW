import 'server-only';

import { AZURE_OCR_LIVE_HTTP_READY } from './feature-gate';
import {
  analyzeAzureDocument,
  resolveAzureAnalyzeFeatures,
  type AzureHttpTransport,
} from './azure-http';
import { mapAzureAnalyzeResult } from './azure-mapper';
import { canonicalToCandidates } from './canonical';
import {
  assertOcrFileLimits,
  azurePagesQuery,
  ocrPageCountForFile,
} from './cost-controls';
import { AZURE_HEBREW_LOCALE, resolveAzureModelId } from './model-strategy';
import { resolveAzureCapabilities } from './provider-capabilities';
import type { ExtractDocumentInput, ExtractDocumentResult, OcrProvider } from './provider';
import type { OcrSafeRawMetadata } from './types';

function bytesFromInput(input: ExtractDocumentInput): Uint8Array | null {
  if (input.bytes && input.bytes.length > 0) return input.bytes;
  if (input.contentBase64?.trim()) {
    return Uint8Array.from(Buffer.from(input.contentBase64, 'base64'));
  }
  return null;
}

function limitFailureMessage(code: 'unsupported_file' | 'too_large' | 'too_many_pages'): string {
  const caps = resolveAzureCapabilities();
  if (code === 'too_large') {
    return `This file exceeds the ${caps.tier} document-reading limit (${Math.floor(caps.maxFileBytes / (1024 * 1024))} MB)`;
  }
  if (code === 'too_many_pages') {
    return `This PDF has more pages than the ${caps.tier} document-reading limit (${caps.maxPages}). The whole file was not processed.`;
  }
  return 'The file cannot be sent for document reading';
}

/**
 * Azure Document Intelligence live adapter.
 *
 * Required env (server only - never NEXT_PUBLIC_*):
 * - OCR_PROVIDER=azure
 * - OCR_PROVIDER_API_KEY=<Azure DI key>
 * - OCR_PROVIDER_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
 * - OCR_PROVIDER_MODEL optional override (default chosen by workflow)
 * - OCR_INGESTION_ENABLED=true
 * - OCR_AZURE_TIER=F0|S0 (default F0)
 * - OCR_AZURE_QUERY_FIELDS=true only on S0 when intentionally enabling paid Query Fields
 */
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  readonly id = 'azure';
  private readonly apiKey: string | undefined;
  private readonly endpoint: string | undefined;
  private readonly modelOverride: string | undefined;
  private readonly transport?: AzureHttpTransport;

  constructor(options?: {
    readonly apiKey?: string;
    readonly endpoint?: string;
    readonly model?: string;
    readonly transport?: AzureHttpTransport;
  }) {
    this.apiKey =
      options?.apiKey?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_API_KEY?.trim() : undefined) ||
      undefined;
    this.endpoint =
      options?.endpoint?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_ENDPOINT?.trim() : undefined) ||
      undefined;
    this.modelOverride =
      options?.model?.trim() ||
      (typeof process !== 'undefined' ? process.env.OCR_PROVIDER_MODEL?.trim() : undefined) ||
      undefined;
    this.transport = options?.transport;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.endpoint);
  }

  async extractReceipt(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
    return this.extractDocument(input);
  }

  async extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        errorCode: 'not_configured',
        message: 'Document reading credentials are not configured',
        rawMetadata: { providerId: this.id, providerStatus: 'not_configured' },
      };
    }

    if (!AZURE_OCR_LIVE_HTTP_READY) {
      return {
        ok: false,
        errorCode: 'empty_result',
        message:
          'Azure OCR adapter is configured but live extraction is not wired in this build; no fields invented',
        rawMetadata: {
          providerId: this.id,
          providerStatus: 'adapter_pending_live_http',
          extractedAt: new Date().toISOString(),
        },
      };
    }

    const bytes = bytesFromInput(input);
    if (!bytes) {
      return {
        ok: false,
        errorCode: 'empty_result',
        message: 'No document content was provided',
        rawMetadata: { providerId: this.id, providerStatus: 'missing_bytes' },
      };
    }

    const capabilities = resolveAzureCapabilities();
    const pageCount = ocrPageCountForFile(input.mimeType, bytes);
    const limits = assertOcrFileLimits(
      {
        mimeType: input.mimeType,
        sizeBytes: bytes.length,
        pageCount,
      },
      capabilities,
    );
    if (!limits.ok) {
      return {
        ok: false,
        errorCode: limits.code,
        message: limitFailureMessage(limits.code),
        rawMetadata: {
          providerId: this.id,
          providerStatus: limits.code,
          pageCount,
          azureTier: capabilities.tier,
          maxPages: capabilities.maxPages,
          maxFileBytes: capabilities.maxFileBytes,
          queryFieldsEnabled: capabilities.queryFields,
        },
      };
    }

    const { model, strategy } = resolveAzureModelId(input.workflow, this.modelOverride);
    const features = resolveAzureAnalyzeFeatures();
    const started = Date.now();

    try {
      const operation = await analyzeAzureDocument({
        endpoint: this.endpoint!,
        apiKey: this.apiKey!,
        model,
        base64Source: Buffer.from(bytes).toString('base64'),
        pages: azurePagesQuery(pageCount, capabilities.maxPages),
        locale: input.locale ?? AZURE_HEBREW_LOCALE,
        features,
        transport: this.transport,
      });

      if (operation.status !== 'succeeded' || !operation.analyzeResult) {
        return {
          ok: false,
          errorCode: operation.status === 'failed' ? 'provider_error' : 'empty_result',
          message: 'Document reading failed',
          rawMetadata: {
            providerId: this.id,
            model,
            modelStrategy: strategy,
            providerStatus: operation.status,
            durationMs: Date.now() - started,
            pageCount,
            azureTier: capabilities.tier,
            queryFieldsRequested: Boolean(features.queryFields?.length),
          },
        };
      }

      const canonical = mapAzureAnalyzeResult({
        analyzeResult: operation.analyzeResult,
        providerId: this.id,
        model,
        extractedAt: new Date().toISOString(),
      });
      const metadata: OcrSafeRawMetadata = {
        ...canonical.metadata,
        modelStrategy: strategy,
        workflow: input.workflow,
        durationMs: Date.now() - started,
        pageCount: canonical.pageCount ?? pageCount,
        azureTier: capabilities.tier,
        hebrewNativePrebuilt: true,
        queryFieldsRequested: Boolean(features.queryFields?.length),
        keyValuePairsRequested: Boolean(features.keyValuePairs),
        providerCapabilities: {
          tier: capabilities.tier,
          maxFileBytes: capabilities.maxFileBytes,
          maxPages: capabilities.maxPages,
          queryFields: capabilities.queryFields,
          queryFieldsCostNote: capabilities.queryFieldsCostNote,
        },
      };

      return {
        ok: true,
        needsReview: true,
        candidates: canonicalToCandidates(canonical),
        canonical,
        rawMetadata: metadata,
        overallConfidence: canonical.overallConfidence,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = (error as { status?: number }).status;
      if (code === 'timeout' || (error instanceof Error && error.name === 'AbortError')) {
        return {
          ok: false,
          errorCode: 'timeout',
          message: 'Document reading timed out',
          rawMetadata: {
            providerId: this.id,
            model,
            modelStrategy: strategy,
            providerStatus: 'timeout',
            durationMs: Date.now() - started,
            errorCategory: 'timeout',
          },
        };
      }
      if (status === 400) {
        return {
          ok: false,
          errorCode: 'unsupported_file',
          message: 'The file could not be read',
          rawMetadata: { providerId: this.id, model, providerStatus: 'bad_request' },
        };
      }
      return {
        ok: false,
        errorCode: 'provider_error',
        message: 'Document reading failed',
        rawMetadata: {
          providerId: this.id,
          model,
          modelStrategy: strategy,
          providerStatus: 'provider_error',
          durationMs: Date.now() - started,
          errorCategory: 'provider_error',
        },
      };
    }
  }
}
