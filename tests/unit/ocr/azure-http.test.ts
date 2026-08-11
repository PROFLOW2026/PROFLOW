import { describe, expect, it } from 'vitest';
import { AzureDocumentIntelligenceProvider } from '@/modules/ocr';
import {
  analyzeAzureDocument,
  sanitizeAzureUserMessage,
  type AzureHttpTransport,
} from '@/modules/ocr/domain/azure-http';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Azure HTTP adapter', () => {
  it('sanitizes provider errors before user display', () => {
    expect(sanitizeAzureUserMessage(401, 'invalid subscription key xyz')).toBe(
      'Document reading is not authorized',
    );
    expect(sanitizeAzureUserMessage(401, 'invalid subscription key xyz')).not.toMatch(/xyz|key/i);
    expect(sanitizeAzureUserMessage(429)).toMatch(/busy/i);
  });

  it('polls until succeeded and maps through the live provider', async () => {
    let polls = 0;
    const transport: AzureHttpTransport = {
      async analyze() {
        return { operationLocation: 'https://example.cognitiveservices.azure.com/ops/1' };
      },
      async getResult() {
        polls += 1;
        if (polls < 2) return { status: 'running' };
        return {
          status: 'succeeded',
          analyzeResult: {
            documents: [
              {
                fields: {
                  MerchantName: { valueString: 'Cafe', confidence: 0.9 },
                  Total: { valueCurrency: { amount: 20, currencyCode: 'ILS' }, confidence: 0.9 },
                },
              },
            ],
          },
        };
      },
    };

    const provider = new AzureDocumentIntelligenceProvider({
      apiKey: 'test-key',
      endpoint: 'https://example.cognitiveservices.azure.com/',
      transport,
    });
    const result = await provider.extractDocument({
      organizationId: 'org-1',
      contentBase64: PNG,
      mimeType: 'image/png',
      workflow: 'expense',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needsReview).toBe(true);
      expect(result.candidates.vendor.value).toBe('Cafe');
      expect(result.rawMetadata?.model).toBe('prebuilt-receipt');
      expect(result.canonical.supplier.name.value).toBe('Cafe');
    }
  });

  it('maps timeout from aborting transport', async () => {
    const transport: AzureHttpTransport = {
      async analyze() {
        const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
        throw error;
      },
      async getResult() {
        throw new Error('not reached');
      },
    };
    await expect(
      analyzeAzureDocument({
        endpoint: 'https://example.cognitiveservices.azure.com/',
        apiKey: 'k',
        model: 'prebuilt-invoice',
        base64Source: PNG,
        pages: '1',
        transport,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('does not append queryFields by default on F0', async () => {
    delete process.env.OCR_AZURE_QUERY_FIELDS;
    process.env.OCR_AZURE_TIER = 'F0';
    let analyzeUrl = '';
    const transport: AzureHttpTransport = {
      async analyze(input) {
        analyzeUrl = `${input.endpoint}?pages=${input.pages}&locale=${input.locale ?? ''}`;
        const { resolveAzureAnalyzeFeatures } = await import('@/modules/ocr/domain/azure-http');
        const features = resolveAzureAnalyzeFeatures(input.features);
        expect(features.queryFields).toBeUndefined();
        expect(features.keyValuePairs).toBe(false);
        expect(input.locale ?? 'he').toMatch(/^he/);
        return { operationLocation: 'https://example.cognitiveservices.azure.com/ops/1' };
      },
      async getResult() {
        return {
          status: 'succeeded',
          analyzeResult: {
            documents: [
              {
                fields: {
                  MerchantName: { valueString: 'Cafe', confidence: 0.9 },
                  Total: { valueCurrency: { amount: 20, currencyCode: 'ILS' }, confidence: 0.9 },
                },
              },
            ],
          },
        };
      },
    };

    const provider = new AzureDocumentIntelligenceProvider({
      apiKey: 'test-key',
      endpoint: 'https://example.cognitiveservices.azure.com/',
      transport,
    });
    const result = await provider.extractDocument({
      organizationId: 'org-1',
      contentBase64: PNG,
      mimeType: 'image/png',
      workflow: 'expense',
    });
    expect(result.ok).toBe(true);
    expect(analyzeUrl).toContain('pages=');
  });
});
