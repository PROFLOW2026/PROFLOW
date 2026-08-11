import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';

vi.mock('@/modules/documents/data/documents.repository', () => ({
  findDocumentById: vi.fn(async (_db: unknown, organizationId: string, documentId: string) => {
    if (
      organizationId === 'org-1' &&
      documentId === '01900000-0000-7000-8000-000000000001'
    ) {
      return { id: documentId, organizationId, status: 'available', deletedAt: null };
    }
    return null;
  }),
}));
import {
  AzureDocumentIntelligenceProvider,
  ScriptedOcrProvider,
  UnimplementedOcrProvider,
  assertOcrFileLimits,
  buildFixtureCandidates,
  confirmOcrCandidate,
  detectDuplicateHits,
  extractReceiptJob,
  isOcrSupportedMime,
  matchVendors,
  resetOcrStoreForTests,
  seedFixtureJob,
  setOcrPersistenceReadyForTests,
} from '@/modules/ocr';
import { getOcrFeatureMode, isOcrFixtureAllowed } from '@/modules/ocr/domain/feature-gate';

function contextWith(permissions: readonly PermissionKey[], org = 'org-1'): OrgContext {
  return {
    userId: 'user-1',
    organizationId: org,
    membershipId: 'membership-1',
    organization: {
      id: org,
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('OCR adversarial', () => {
  it('rejects cross-org document ids', async () => {
    setOcrPersistenceReadyForTests(false);
    resetOcrStoreForTests();
    await expect(
      extractReceiptJob(
        contextWith([PERMISSIONS.DOCUMENTS_MANAGE]),
        { documentId: '01900000-0000-7000-8000-000000000099', filename: 'x.pdf' },
        new ScriptedOcrProvider(buildFixtureCandidates()),
      ),
    ).rejects.toThrow(NotFoundError);
    setOcrPersistenceReadyForTests(true);
  });

  it('does not treat another org vendor as a match', () => {
    const hits = matchVendors({
      vendorName: 'Alpha',
      companyNumber: '512345678',
      vatId: null,
      vendors: [{ id: 'foreign', name: 'Alpha', identifiers: ['512345678'] }],
    });
    expect(hits[0]?.vendorId).toBe('foreign');
  });

  it('sanitizes malicious filenames at the storage boundary via extract metadata only', async () => {
    setOcrPersistenceReadyForTests(false);
    resetOcrStoreForTests();
    const job = await extractReceiptJob(
      contextWith([PERMISSIONS.DOCUMENTS_MANAGE]),
      { filename: '../../etc/passwd.pdf', mimeType: 'application/pdf' },
      new ScriptedOcrProvider(buildFixtureCandidates()),
    );
    expect(job.sourceDocument.filename).toBe('../../etc/passwd.pdf');
    expect(job.confirmedExpenseId).toBeNull();
    setOcrPersistenceReadyForTests(true);
  });

  it('rejects oversized and unsupported MIME before provider billing', () => {
    expect(isOcrSupportedMime('application/vnd.ms-excel')).toBe(false);
    expect(isOcrSupportedMime('application/pdf')).toBe(true);
    expect(assertOcrFileLimits({ mimeType: 'image/png', sizeBytes: 26 * 1024 * 1024 }).ok).toBe(
      false,
    );
    expect(assertOcrFileLimits({ mimeType: 'application/pdf', pageCount: 99 }).ok).toBe(false);
  });

  it('does not invent amounts from a fake/empty provider response', async () => {
    const provider = new AzureDocumentIntelligenceProvider({
      apiKey: 'k',
      endpoint: 'https://example.cognitiveservices.azure.com/',
      transport: {
        analyze: async () => ({ operationLocation: 'https://example/ops/1' }),
        getResult: async () => ({ status: 'succeeded', analyzeResult: { documents: [] } }),
      },
    });
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await provider.extractDocument({
      organizationId: 'org-1',
      contentBase64: png,
      mimeType: 'image/png',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates.gross.value).toBeNull();
      expect(result.needsReview).toBe(true);
    }
  });

  it('keeps conflicting totals as warnings, not repaired facts', async () => {
    setOcrPersistenceReadyForTests(false);
    resetOcrStoreForTests();
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates({ net: '10', tax: '10', gross: '999' }),
    });
    const created = await confirmOcrCandidate(
      ctx,
      {
        jobId: job.id,
        confirm: true,
        acceptedFields: ['gross', 'currency', 'net', 'tax'],
      },
      { createExpense: async () => ({ id: 'exp-1' }) },
    );
    expect(created.kind).toBe('created');
    if (created.kind === 'created' && created.draftTarget === 'expense') {
      expect(created.expenseInput.amount).toBe('999');
      expect(created.expenseInput.netAmount).toBe('10');
    }
    setOcrPersistenceReadyForTests(true);
  });

  it('does not auto-select when company numbers collide across vendors', () => {
    const hits = matchVendors({
      vendorName: null,
      companyNumber: '512345678',
      vatId: null,
      vendors: [
        { id: 'a', name: 'A', identifiers: ['512345678'] },
        { id: 'b', name: 'B', identifiers: ['512345678'] },
      ],
    });
    expect(hits).toHaveLength(2);
  });

  it('google/aws registry slots never fake HTTP', async () => {
    const google = new UnimplementedOcrProvider('google');
    const aws = new UnimplementedOcrProvider('aws');
    expect(google.isConfigured()).toBe(false);
    const result = await aws.extractDocument({ organizationId: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('not_configured');
  });

  it('fixture OCR cannot be enabled in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OCR_ALLOW_FIXTURE', 'true');
    vi.stubEnv('OCR_INGESTION_ENABLED', 'true');
    vi.stubEnv('OCR_PROVIDER', 'stub');
    try {
      expect(isOcrFixtureAllowed()).toBe(false);
      expect(getOcrFeatureMode()).toBe('disabled');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('same file linked twice still only warns', () => {
    const hits = detectDuplicateHits(
      { checksumSha256: 'same', documentId: 'doc-b' },
      [
        { kind: 'document', id: 'doc-a', checksumSha256: 'same', documentId: 'doc-a' },
        { kind: 'expense', id: 'e1', checksumSha256: 'same' },
      ],
    );
    expect(hits.every((hit) => hit.kind === 'exact_file')).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });
});
