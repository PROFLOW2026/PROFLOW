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
import { assertAllowedSumitApiBase } from './sumit-provider-environment';
import { assembleSumitCreateRequestBody } from './sumit-create-payload';
import { parseSumitDocumentAmounts } from './sumit-document-amounts';

export { SumitAmbiguousError } from './sumit-api-envelope';
export type { SumitTestConnectionResult } from './sumit-connection-diagnostics';

/**
 * The only SUMIT API host. This is the live API, not a test sandbox.
 * Arbitrary base URLs are rejected.
 */
export const SUMIT_API_BASE = 'https://api.sumit.co.il';
/** @deprecated Same value as SUMIT_API_BASE. Kept so older imports still resolve to the live host. */
export const SUMIT_TEST_API_BASE = SUMIT_API_BASE;

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

export interface SumitDocumentPdfResponse {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface SumitSendDocumentRequest {
  readonly documentId: string;
  readonly emailAddress: string;
  readonly original?: boolean;
}

/** SUMIT expense document types (15–21). Type 22 SupplierPayment must not be batched with these. */
export const SUMIT_EXPENSE_DOCUMENT_TYPES = [15, 16, 17, 18, 19, 20, 21] as const;

export interface SumitExpenseListDocument {
  readonly documentId: string;
  readonly documentType: number | null;
  readonly isDraft: boolean | null;
  readonly date: string | null;
}

export interface SumitHttpClient {
  createDocument(input: SumitCreateDocumentRequest): Promise<SumitCreateDocumentResponse>;
  getDocumentDetails(documentId: string): Promise<SumitCreateDocumentResponse>;
  getDocumentPdf(documentId: string, original?: boolean): Promise<SumitDocumentPdfResponse>;
  listExpenseDocuments(input?: {
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly includeDrafts?: boolean;
    readonly startIndex?: number;
    readonly pageSize?: number;
  }): Promise<readonly SumitExpenseListDocument[]>;
  sendDocument(input: SumitSendDocumentRequest): Promise<void>;
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
  const baseUrl = (options.baseUrl ?? SUMIT_API_BASE).replace(/\/$/, '');
  assertAllowedSumitApiBase(baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  function isPdfBytes(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

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

    async listExpenseDocuments(input = {}) {
      const raw = await postJson<Record<string, unknown>>('/accounting/documents/list/', {
        DocumentTypes: [...SUMIT_EXPENSE_DOCUMENT_TYPES],
        DateFrom: input.dateFrom ?? null,
        DateTo: input.dateTo ?? null,
        IncludeDrafts: input.includeDrafts ?? true,
        Paging: {
          StartIndex: input.startIndex ?? 0,
          PageSize: Math.min(Math.max(input.pageSize ?? 100, 10), 1000),
        },
      });
      const data =
        raw.Data && typeof raw.Data === 'object'
          ? (raw.Data as Record<string, unknown>)
          : raw;
      const docs = (data.Documents ?? []) as Array<Record<string, unknown>>;
      return docs
        .map((doc) => ({
          documentId:
            typeof doc.DocumentID === 'number'
              ? String(doc.DocumentID)
              : typeof doc.DocumentID === 'string'
                ? doc.DocumentID
                : '',
          documentType: typeof doc.Type === 'number' ? doc.Type : null,
          isDraft: typeof doc.IsDraft === 'boolean' ? doc.IsDraft : null,
          date: typeof doc.Date === 'string' ? doc.Date : null,
        }))
        .filter((doc) => doc.documentId.length > 0);
    },

    async getDocumentPdf(documentId, original = true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/accounting/documents/getpdf/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
          body: JSON.stringify({
            Credentials: coreCredentials(credentials),
            DocumentID: Number(documentId),
            Original: original,
          }),
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') ?? '';
        const buffer = new Uint8Array(await response.arrayBuffer());

        if (isPdfBytes(buffer)) {
          return { bytes: buffer, contentType: 'application/pdf' };
        }

        if (contentType.includes('json') || buffer[0] === 0x7b) {
          const text = new TextDecoder().decode(buffer);
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { rawText: text.slice(0, 500) };
          }
          const envelope = parseSumitApiEnvelope(response.status, parsed);
          if (response.status >= 500 || response.status === 408 || response.status === 429) {
            throw new SumitAmbiguousError(`SUMIT ambiguous PDF response (${response.status})`);
          }
          if (!response.ok) {
            throw new SumitHttpError(
              response.status,
              envelope,
              envelope.userErrorMessage ?? `SUMIT PDF request failed (${response.status})`,
            );
          }
          assertSumitEnvelopeSuccess(envelope);
        }

        throw new SumitHttpError(
          response.status,
          null,
          'SUMIT getpdf did not return a PDF document',
        );
      } catch (error) {
        if (
          error instanceof SumitAmbiguousError ||
          error instanceof SumitHttpError ||
          error instanceof SumitApplicationError
        ) {
          throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new SumitAmbiguousError('SUMIT PDF request timed out');
        }
        if (error instanceof TypeError) {
          throw new SumitAmbiguousError(error.message);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    async sendDocument(input) {
      await postJson('/accounting/documents/send/', {
        EntityID: Number(input.documentId),
        EmailAddress: input.emailAddress,
        Original: input.original ?? true,
      });
    },
  };
}
