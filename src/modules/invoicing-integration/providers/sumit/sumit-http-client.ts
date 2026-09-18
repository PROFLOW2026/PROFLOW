import 'server-only';

import type { InvoicingProviderCredentials } from '../../domain/types';

/** SUMIT test environment base URL (Milestone A/B — production hard-denied). */
export const SUMIT_TEST_API_BASE = 'https://api.sumit.co.il';

export class SumitAmbiguousError extends Error {
  readonly partialDocumentId: string | null;

  constructor(message: string, partialDocumentId: string | null = null) {
    super(message);
    this.name = 'SumitAmbiguousError';
    this.partialDocumentId = partialDocumentId;
  }
}

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
  ping(): Promise<boolean>;
}

function coreCredentials(credentials: InvoicingProviderCredentials) {
  return {
    CompanyID: credentials.companyId,
    APIKey: credentials.apiKey,
  };
}

export function createSumitHttpClient(
  credentials: InvoicingProviderCredentials,
  options: SumitHttpClientOptions = {},
): SumitHttpClient {
  const baseUrl = (options.baseUrl ?? SUMIT_TEST_API_BASE).replace(/\/$/, '');
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
          parsed = { rawText: text };
        }
      }

      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        throw new SumitAmbiguousError(`SUMIT ambiguous response (${response.status})`);
      }

      if (!response.ok) {
        const message =
          typeof parsed === 'object' &&
          parsed != null &&
          'Message' in parsed &&
          typeof (parsed as { Message?: unknown }).Message === 'string'
            ? (parsed as { Message: string }).Message
            : `SUMIT request failed (${response.status})`;
        const error = new Error(message) as Error & { statusCode?: number; body?: unknown };
        error.statusCode = response.status;
        error.body = parsed;
        throw error;
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof SumitAmbiguousError) throw error;
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

  function mapCreateResponse(raw: unknown): SumitCreateDocumentResponse {
    const data = raw as Record<string, unknown>;
    const dataObj =
      data.Data && typeof data.Data === 'object' ? (data.Data as Record<string, unknown>) : data;
    const documentId =
      typeof dataObj.DocumentID === 'number'
        ? String(dataObj.DocumentID)
        : typeof dataObj.DocumentID === 'string'
          ? dataObj.DocumentID
          : null;
    return {
      documentId,
      documentNumber:
        typeof dataObj.DocumentNumber === 'string'
          ? dataObj.DocumentNumber
          : typeof dataObj.DocumentNumber === 'number'
            ? String(dataObj.DocumentNumber)
            : null,
      netAmount: typeof dataObj.NetAmount === 'string' ? dataObj.NetAmount : null,
      vatAmount: typeof dataObj.VATAmount === 'string' ? dataObj.VATAmount : null,
      grossAmount: typeof dataObj.GrossAmount === 'string' ? dataObj.GrossAmount : null,
      raw,
    };
  }

  return {
    async ping() {
      try {
        await postJson('/accounting/documents/list/', {
          PageSize: 1,
          PageNumber: 1,
        });
        return true;
      } catch {
        return false;
      }
    },

    async createDocument(input) {
      const raw = await postJson<unknown>('/accounting/documents/create/', {
        DocumentType: input.documentType,
        Details: {
          ExternalReference: input.externalReference,
        },
        ...input.payload,
      });
      const mapped = mapCreateResponse(raw);
      if (!mapped.documentId) {
        throw new Error('SUMIT create succeeded without DocumentID');
      }
      return mapped;
    },

    async getDocumentDetails(documentId) {
      const raw = await postJson<unknown>('/accounting/documents/getdetails/', {
        DocumentID: Number(documentId),
      });
      return mapCreateResponse(raw);
    },
  };
}
