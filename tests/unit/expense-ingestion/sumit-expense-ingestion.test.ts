import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import {
  SUMIT_EXPENSE_DOCUMENT_TYPES,
  createSumitHttpClient,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import {
  isSumitExpenseIngestionEnabled,
  parseSumitIdempotencyKey,
  sumitOcrIdempotencyKey,
} from '@/modules/expense-ingestion';
import { pollSumitExpensesForOrg } from '@/modules/expense-ingestion/application/poll-sumit-expenses';
import { queueSumitImportOcr } from '@/modules/expense-ingestion/application/queue-import-ocr';
import {
  setOrgExpenseIngestionSettingsForTests,
} from '@/modules/expense-ingestion/data/settings.repository';
import type { ExternalExpenseImport } from '@/modules/expense-ingestion/domain/types';

const ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const REAL_ORG_ID = '00000000-0000-0000-0000-000000000001';

function baseImport(overrides: Partial<ExternalExpenseImport> = {}): ExternalExpenseImport {
  return {
    id: 'imp-1',
    organizationId: ORG_ID,
    provider: 'sumit',
    externalDocumentId: '2376004144',
    sourceDocumentType: 15,
    status: 'detected',
    ocrJobId: null,
    pdfChecksumSha256: null,
    detectedAt: new Date().toISOString(),
    lastCheckedAt: null,
    processedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function workerContext(): OrgContext {
  return {
    userId: 'worker',
    organizationId: ORG_ID,
    membershipId: 'worker',
    organization: {
      id: ORG_ID,
      name: 'Demo',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('SUMIT expense ingestion', () => {
  afterEach(() => {
    setOrgExpenseIngestionSettingsForTests(null);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('builds stable OCR idempotency keys from DocumentID', () => {
    expect(sumitOcrIdempotencyKey('2376004144')).toBe('sumit:2376004144');
    expect(parseSumitIdempotencyKey('sumit:2376004144')).toBe('2376004144');
    expect(parseSumitIdempotencyKey('manual:abc')).toBeNull();
  });

  it('treats ingestion as enabled only when provider is sumit', () => {
    expect(isSumitExpenseIngestionEnabled({ provider: 'none' })).toBe(false);
    expect(isSumitExpenseIngestionEnabled({ provider: 'sumit' })).toBe(true);
  });

  it('excludes supplier payment type 22 from expense document types', () => {
    expect(SUMIT_EXPENSE_DOCUMENT_TYPES).toEqual([15, 16, 17, 18, 19, 20, 21]);
    expect(SUMIT_EXPENSE_DOCUMENT_TYPES.includes(22 as never)).toBe(false);
  });

  it('listExpenseDocuments requests only expense types 15-21', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          Status: 0,
          Data: {
            Documents: [{ DocumentID: 2376004144, Type: 15, IsDraft: true }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const client = createSumitHttpClient(
      { companyId: 1, apiKey: 'key' },
      { fetchImpl: fetchImpl as typeof fetch },
    );
    const docs = await client.listExpenseDocuments({ includeDrafts: true });
    expect(docs).toHaveLength(1);
    expect(bodies[0]?.DocumentTypes).toEqual([15, 16, 17, 18, 19, 20, 21]);
    expect(bodies[0]?.DocumentTypes).not.toContain(22);
  });

  it('does not poll when expense ingestion is disabled', async () => {
    setOrgExpenseIngestionSettingsForTests({ provider: 'none' });
    const resolveSpy = vi.spyOn(
      await import('@/modules/expense-ingestion/application/resolve-sumit-client'),
      'resolveSumitHttpClientForOrg',
    );
    const result = await pollSumitExpensesForOrg(workerContext());
    expect(result).toEqual({ detected: 0, queued: 0, skipped: 0, errors: 0 });
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('reuses existing OCR job for the same SUMIT DocumentID', async () => {
    vi.stubEnv('OCR_INGESTION_ENABLED', 'true');
    vi.stubEnv('OCR_PROVIDER', 'azure');
    vi.stubEnv('OCR_PROVIDER_API_KEY', 'test-key');
    vi.stubEnv('OCR_PROVIDER_ENDPOINT', 'https://example.cognitiveservices.azure.com');

    const existingJob = {
      id: 'job-existing',
      organizationId: ORG_ID,
      documentId: null,
      sourceDocument: { documentId: null, filename: 'x.pdf', mimeType: 'application/pdf' },
      status: 'needs_review' as const,
      reviewStatus: 'pending' as const,
      candidates: null,
      extractedCandidates: null,
      reviewOverrides: null,
      acceptedFields: null,
      rejectedFields: null,
      rawMetadata: { providerId: 'azure', checksumSha256: 'abc' },
      overallConfidence: null,
      errorCode: null,
      errorMessage: null,
      providerId: 'azure',
      confirmedExpenseId: null,
      confirmedVendorBillId: null,
      confirmedVendorCreditId: null,
      confirmedDraftTarget: null,
      documentVersionId: null,
      batchId: null,
      attemptCount: 1,
      lastError: null,
      idempotencyKey: 'sumit:2376004144',
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.spyOn(
      await import('@/modules/ocr/data/resolve-repository'),
      'getOcrRepository',
    ).mockReturnValue({
      findJobByIdempotencyKey: vi.fn(async () => existingJob),
      updateJob: vi.fn(),
      findJob: vi.fn(),
      listJobsForOrg: vi.fn(),
    } as never);

    vi.spyOn(
      await import('@/modules/expense-ingestion/data/imports.repository'),
      'updateImport',
    ).mockImplementation(async (_db, _org, _id, patch) =>
      baseImport({
        status: patch.status ?? 'needs_review',
        ocrJobId: patch.ocrJobId ?? existingJob.id,
      }),
    );

    vi.spyOn(
      await import('@/modules/expense-ingestion/application/resolve-sumit-client'),
      'resolveSumitHttpClientForOrg',
    ).mockResolvedValue({
      getDocumentPdf: vi.fn(),
      listExpenseDocuments: vi.fn(),
    } as never);

    const extractSpy = vi.spyOn(
      await import('@/modules/ocr/application/extract-receipt'),
      'extractReceiptJob',
    );

    const result = await queueSumitImportOcr(workerContext(), baseImport());
    expect(result.status).toBe('needs_review');
    expect(result.ocrJobId).toBe('job-existing');
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it('does not target the real business org in demo constants', () => {
    expect(ORG_ID).toBe('b1460c82-36cd-429a-b30d-ea5644d58fe3');
    expect(ORG_ID).not.toBe(REAL_ORG_ID);
  });
});
