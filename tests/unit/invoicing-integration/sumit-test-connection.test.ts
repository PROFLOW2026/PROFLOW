import { describe, expect, it, vi } from 'vitest';
import {
  classifySumitConnectionFailure,
  sumitConnectionFailureMessageKey,
} from '@/modules/invoicing-integration/providers/sumit/sumit-connection-diagnostics';
import {
  parseSumitApiEnvelope,
  SumitApplicationError,
} from '@/modules/invoicing-integration/providers/sumit/sumit-api-envelope';
import {
  buildSumitDocumentsListProbeBody,
  createSumitHttpClient,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SUMIT test connection diagnostics', () => {
  it('uses nested Paging per OpenAPI for list probe', () => {
    expect(buildSumitDocumentsListProbeBody()).toEqual({
      Paging: { StartIndex: 0, PageSize: 10 },
    });
  });

  it('treats HTTP 200 + Status 1 as invalid credentials', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.Credentials.APIKey).toBe('bad-key');
      expect(payload.Paging).toEqual({ StartIndex: 0, PageSize: 10 });
      expect(payload.PageNumber).toBeUndefined();
      return jsonResponse(200, {
        Data: null,
        Status: 1,
        UserErrorMessage: 'Invalid Credentials (CompanyID/APIKey are incorrect)',
        TechnicalErrorDetails: null,
      });
    });

    const client = createSumitHttpClient(
      { companyId: 999, apiKey: 'bad-key' },
      { fetchImpl, baseUrl: 'https://api.example.test' },
    );

    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe('invalid_credentials');
    expect(result.httpStatus).toBe(200);
    expect(result.providerErrorCode).toBe('1');
    expect(result.safeProviderMessage).toContain('Invalid Credentials');
    expect(JSON.stringify(result)).not.toContain('bad-key');
  });

  it('classifies network failures distinctly from credential failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    const client = createSumitHttpClient(
      { companyId: 1, apiKey: 'secret' },
      { fetchImpl, baseUrl: 'https://api.example.test' },
    );

    const result = await client.testConnection();
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe('network');
    expect(sumitConnectionFailureMessageKey(result.failureClass)).toBe(
      'invoicingIntegration.errors.providerUnreachable',
    );
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('accepts HTTP 200 + Status 0 as success', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        Data: { Documents: [] },
        Status: 0,
        UserErrorMessage: null,
        TechnicalErrorDetails: null,
      }),
    );

    const client = createSumitHttpClient(
      { companyId: 1, apiKey: 'good-key' },
      { fetchImpl, baseUrl: 'https://api.example.test' },
    );

    const result = await client.testConnection();
    expect(result.ok).toBe(true);
  });

  it('maps module inactive hints to moduleInactive message key', () => {
    const envelope = parseSumitApiEnvelope(200, {
      Status: 1,
      UserErrorMessage: 'Accounting module is not enabled for this company',
      Data: null,
    });
    const classified = classifySumitConnectionFailure(new SumitApplicationError(envelope));
    expect(classified.failureClass).toBe('module_inactive');
    expect(sumitConnectionFailureMessageKey(classified.failureClass)).toBe(
      'invoicingIntegration.errors.moduleInactive',
    );
  });
});
