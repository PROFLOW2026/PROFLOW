import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/documents/data/documents.repository', () => ({
  findDocumentById: vi.fn(async (_db: unknown, organizationId: string, documentId: string) => {
    if (
      organizationId === 'org-1' &&
      documentId === '01900000-0000-7000-8000-000000000001'
    ) {
      return {
        id: documentId,
        organizationId,
        status: 'available',
        deletedAt: null,
        currentVersionId: '01900000-0000-7000-8000-0000000000v1',
      };
    }
    return null;
  }),
}));

import {
  ScriptedOcrProvider,
  StubOcrProvider,
  buildFixtureCandidates,
  cancelOcrJob,
  confirmOcrCandidate,
  createOcrBatch,
  createQueuedJob,
  extractReceiptJob,
  findJob,
  flushOcrBackgroundJobs,
  listJobsForOrg,
  processQueuedJob,
  resetOcrBackgroundJobsForTests,
  resetOcrStoreForTests,
  setOcrBackgroundProcessingForTests,
  setOcrPersistenceReadyForTests,
} from '@/modules/ocr';

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

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DOC_ID = '01900000-0000-7000-8000-000000000001';

describe('OCR background job queue', () => {
  beforeEach(() => {
    setOcrPersistenceReadyForTests(false);
    resetOcrStoreForTests();
    resetOcrBackgroundJobsForTests();
  });

  afterEach(() => {
    setOcrPersistenceReadyForTests(true);
    resetOcrBackgroundJobsForTests();
  });

  it('enqueues without blocking and does not create a second active job for the same document', async () => {
    setOcrBackgroundProcessingForTests(false);
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    const spy = vi.spyOn(provider, 'extractDocument');
    const payload = {
      documentId: DOC_ID,
      filename: 'a.png',
      mimeType: 'image/png',
      contentBase64: PNG,
    };

    const first = await extractReceiptJob(ctx, payload, provider);
    expect(first.status).toBe('queued');
    expect(first.documentVersionId).toBe('01900000-0000-7000-8000-0000000000v1');
    expect(spy).not.toHaveBeenCalled();

    const second = await extractReceiptJob(ctx, payload, provider);
    expect(second.id).toBe(first.id);
    expect(second.rawMetadata?.reusedExistingJob).toBe(true);

    expect(() =>
      createQueuedJob({
        organizationId: ctx.organizationId,
        documentId: DOC_ID,
        filename: 'a.png',
        mimeType: 'image/png',
        providerId: provider.id,
      }),
    ).toThrow(ConflictError);

    const active = listJobsForOrg(ctx.organizationId).filter(
      (job) => job.status === 'queued' || job.status === 'processing' || job.status === 'running',
    );
    expect(active).toHaveLength(1);
  });

  it('failed extraction does not create a draft financial entity', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const queued = await extractReceiptJob(
      ctx,
      { filename: 'blank.pdf', mimeType: 'application/pdf' },
      new StubOcrProvider(undefined),
    );
    expect(queued.status).toBe('queued');
    await flushOcrBackgroundJobs();
    const failed = findJob(ctx.organizationId, queued.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.confirmedExpenseId).toBeNull();
    expect(failed?.confirmedVendorBillId).toBeNull();
    expect(failed?.confirmedVendorCreditId).toBeNull();
    expect(failed?.confirmedDraftTarget).toBeNull();
    expect(failed?.candidates).toBeNull();
  });

  it('retries a failed job onto the same row without a second active processor', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const failing = new StubOcrProvider(undefined);
    const queued = await extractReceiptJob(
      ctx,
      { documentId: DOC_ID, filename: 'a.png', mimeType: 'image/png', contentBase64: PNG },
      failing,
    );
    await flushOcrBackgroundJobs();
    expect(findJob(ctx.organizationId, queued.id)?.status).toBe('failed');

    const retried = await extractReceiptJob(
      ctx,
      {
        documentId: DOC_ID,
        filename: 'a.png',
        mimeType: 'image/png',
        contentBase64: PNG,
        forceRetry: true,
      },
      failing,
    );
    expect(retried.id).toBe(queued.id);
    expect(retried.status).toBe('queued');
    const active = listJobsForOrg(ctx.organizationId).filter(
      (job) => job.status === 'queued' || job.status === 'processing' || job.status === 'running',
    );
    expect(active).toHaveLength(1);

    await flushOcrBackgroundJobs();
    const failedAgain = findJob(ctx.organizationId, queued.id);
    expect(failedAgain?.status).toBe('failed');
    expect(failedAgain?.confirmedExpenseId).toBeNull();
    expect(failedAgain?.rawMetadata?.manualRetryCount).toBe(1);
  });

  it('isolates processQueuedJob to the caller organization', async () => {
    setOcrBackgroundProcessingForTests(false);
    const orgA = contextWith([PERMISSIONS.DOCUMENTS_MANAGE], 'org-1');
    const orgB = contextWith([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_READ], 'org-b');
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    const queued = await extractReceiptJob(
      orgA,
      { documentId: DOC_ID, filename: 'a.png', mimeType: 'image/png', contentBase64: PNG },
      provider,
    );

    const crossed = await processQueuedJob(orgB, queued.id, provider);
    expect(crossed).toBeNull();
    expect(findJob(orgA.organizationId, queued.id)?.status).toBe('queued');
    expect(findJob(orgB.organizationId, queued.id)).toBeNull();
  });

  it('confirm still creates a draft only after human confirm', async () => {
    const manage = contextWith([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_READ]);
    const expense = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    const queued = await extractReceiptJob(
      manage,
      { documentId: DOC_ID, filename: 'a.png', mimeType: 'image/png', contentBase64: PNG },
      provider,
    );
    await flushOcrBackgroundJobs();
    const reviewed = findJob(manage.organizationId, queued.id);
    expect(reviewed?.status).toBe('needs_review');
    expect(reviewed?.confirmedExpenseId).toBeNull();

    const createExpense = vi.fn(async () => ({ id: 'draft-only-1' }));
    const created = await confirmOcrCandidate(
      expense,
      {
        jobId: queued.id,
        confirm: true,
        acceptedFields: ['vendor', 'gross', 'currency', 'date', 'net', 'tax', 'description'],
      },
      { createExpense },
    );
    expect(created.kind).toBe('created');
    if (created.kind === 'created' && created.draftTarget === 'expense') {
      expect(created.expenseId).toBe('draft-only-1');
      expect(created.draft.status).toBe('draft');
      expect(created.draft.isLedgerTruth).toBe(false);
    }
    expect(createExpense).toHaveBeenCalledTimes(1);
  });

  it('processQueuedJob is idempotent after needs_review', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    const spy = vi.spyOn(provider, 'extractDocument');
    const queued = await extractReceiptJob(
      ctx,
      { documentId: DOC_ID, filename: 'a.png', mimeType: 'image/png', contentBase64: PNG },
      provider,
    );
    await flushOcrBackgroundJobs();
    expect(spy).toHaveBeenCalledTimes(1);
    const again = await processQueuedJob(ctx, queued.id, provider);
    expect(again?.status).toBe('needs_review');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cancels a queued job and never writes a draft', async () => {
    setOcrBackgroundProcessingForTests(false);
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const queued = await extractReceiptJob(
      ctx,
      { documentId: DOC_ID, filename: 'a.png', mimeType: 'image/png', contentBase64: PNG },
      new ScriptedOcrProvider(buildFixtureCandidates()),
    );
    const cancelled = await cancelOcrJob(ctx, { jobId: queued.id });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.confirmedExpenseId).toBeNull();
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  it('tracks batch progress across attached jobs', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_READ]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    const { batch } = await createOcrBatch(ctx, { totalCount: 1 }, provider);
    expect(batch.status).toBe('queued');
    expect(batch.totalCount).toBe(1);

    const job = await extractReceiptJob(
      ctx,
      {
        documentId: DOC_ID,
        filename: 'a.png',
        mimeType: 'image/png',
        contentBase64: PNG,
        batchId: batch.id,
      },
      provider,
    );
    expect(job.batchId).toBe(batch.id);
    await flushOcrBackgroundJobs();
    const settled = findJob(ctx.organizationId, job.id);
    expect(settled?.status).toBe('needs_review');
  });
});
