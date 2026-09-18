import 'server-only';

import type { InvoicingProviderCredentials } from '../../domain/types';
import {
  assertSumitEnvelopeSuccess,
  parseSumitApiEnvelope,
  SumitAmbiguousError,
  SumitApplicationError,
  SumitHttpError,
} from './sumit-api-envelope';
import {
  classifySumitConnectionFailure,
  toSuccessfulSumitTestConnectionResult,
  type SumitTestConnectionResult,
} from './sumit-connection-diagnostics';
import { assertSumitTestProviderEndpoint } from './sumit-provider-environment';
import { assembleSumitCreateRequestBody } from './sumit-create-payload';
import { parseSumitDocumentAmounts } from './sumit-document-amounts';

export { SumitAmbiguousError } from './sumit-api-envelope';
export type { SumitTestConnectionResult } from './sumit-connection-diagnostics';

/** SUMIT test environment base URL (Milestone A/B — production hard-denied). */
export const SUMIT_TEST_API_BASE = 'https://api.sumit.co.il';

export interface SumitHttpClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface SumitCreateDocumentRequest {
  readonly documentType: number;
  readonly externalReference: string;
  readonly payload: Record<string, unknown>;
}

export interface SumitCreateDocumentResponse {
  readonly documentId: string | null;
  readonly documentNumber: string | null;
  readonly netAmount: string | null;
  readonly vatAmount: string | null;
  readonly grossAmount: string | null;
  readonly raw: unknown;
}

export interface SumitHttpClient {
  createDocument(input: SumitCreateDocumentRequest): Promise<SumitCreateDocumentResponse>;
  getDocumentDetails(documentId: string): Promise<SumitCreateDocumentResponse>;
  /** @deprecated Prefer testConnection() for credential verification. */
  ping(): Promise<boolean>;
  testConnection(): Promise<SumitTestConnectionResult>;
}

function coreCredentials(credentials: InvoicingProviderCredentials) {
  return {
    CompanyID: credentials.companyId,
    APIKey: credentials.apiKey,
  };
}

/** OpenAPI: Accounting_Documents_List_Request uses nested Paging, not PageNumber. */
export function buildSumitDocumentsListProbeBody(): Record<string, unknown> {
  return {
    Paging: {
      StartIndex: 0,
      PageSize: 10,
    },
  };
}

export function createSumitHttpClient(
  credentials: InvoicingProviderCredentials,
  options: SumitHttpClientOptions = {},
): SumitHttpClient {
  const baseUrl = (options.baseUrl ?? SUMIT_TEST_API_BASE).replace(/\/$/, '');
  assertSumitTestProviderEndpoint(baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Credentials: coreCredentials(credentials),
          ...body,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { rawText: text.slice(0, 500) };
        }
      }

      const envelope = parseSumitApiEnvelope(response.status, parsed);

      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        throw new SumitAmbiguousError(`SUMIT ambiguous response (${response.status})`);
      }

      if (!response.ok) {
        throw new SumitHttpError(
          response.status,
          envelope,
          envelope.userErrorMessage ?? `SUMIT request failed (${response.status})`,
        );
      }

      assertSumitEnvelopeSuccess(envelope);
      return (envelope.data ?? parsed) as T;
    } catch (error) {
      if (
        error instanceof SumitAmbiguousError ||
        error instanceof SumitHttpError ||
        error instanceof SumitApplicationError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SumitAmbiguousError('SUMIT request timed out');
      }
      if (error instanceof TypeError) {
        throw new SumitAmbiguousError(error.message);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function mapDocumentResponse(raw: unknown): SumitCreateDocumentResponse {
    const data = raw as Record<string, unknown>;
    const dataObj =
      data.Data && typeof data.Data === 'object' ? (data.Data as Record<string, unknown>) : data;
    const documentId =
      typeof dataObj.DocumentID === 'number'
        ? String(dataObj.DocumentID)
        : typeof dataObj.DocumentID === 'string'
          ? dataObj.DocumentID
          : null;
    const amounts = parseSumitDocumentAmounts(raw);
    return {
      documentId,
      documentNumber:
        typeof dataObj.DocumentNumber === 'string'
          ? dataObj.DocumentNumber
          : typeof dataObj.DocumentNumber === 'number'
            ? String(dataObj.DocumentNumber)
            : null,
      netAmount: amounts.netAmount,
      vatAmount: amounts.vatAmount,
      grossAmount: amounts.grossAmount,
      raw,
    };
  }

  async function testConnection(): Promise<SumitTestConnectionResult> {
    try {
      await postJson('/accounting/documents/list/', buildSumitDocumentsListProbeBody());
      return toSuccessfulSumitTestConnectionResult();
    } catch (error) {
      return classifySumitConnectionFailure(error);
    }
  }

  return {
    async ping() {
      const result = await testConnection();
      return result.ok;
    },

    testConnection,

    async createDocument(input) {
      const raw = await postJson<unknown>(
        '/accounting/documents/create/',
        assembleSumitCreateRequestBody(input.payload, input.externalReference),
      );
      const mapped = mapDocumentResponse(raw);
      if (!mapped.documentId) {
        throw new Error('SUMIT create succeeded without DocumentID');
      }
      return mapped;
    },

    async getDocumentDetails(documentId) {
      const raw = await postJson<unknown>('/accounting/documents/getdetails/', {
        DocumentID: Number(documentId),
      });
      return mapDocumentResponse(raw);
    },
  };
}
