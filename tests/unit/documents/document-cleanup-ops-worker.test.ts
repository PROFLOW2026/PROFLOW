import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(() => ({})),
  withUserContext: vi.fn(
    async <T>(_userId: string, fn: (tx: unknown) => Promise<T>) => fn({}),
  ),
  listActiveOrganizationIds: vi.fn(),
  findActiveOrgOwnerUserId: vi.fn(),
  resolveOrgContext: vi.fn(async (_tx: unknown, input: { organizationId: string }) => ({
    organizationId: input.organizationId,
  })),
  planFailedDocumentCleanups: vi.fn(),
}));

vi.mock('@/shared/db/client', () => ({
  getAdminDb: mocks.getAdminDb,
  withUserContext: mocks.withUserContext,
}));

vi.mock('@/modules/tenancy', () => ({
  listActiveOrganizationIds: mocks.listActiveOrganizationIds,
  resolveOrgContext: mocks.resolveOrgContext,
}));

vi.mock('@/modules/recurring-drafts/application/ops-worker', () => ({
  findActiveOrgOwnerUserId: mocks.findActiveOrgOwnerUserId,
}));

vi.mock('@/modules/documents/application/manage-document', () => ({
  planFailedDocumentCleanups: mocks.planFailedDocumentCleanups,
}));

import { runDocumentCleanupOpsWorker } from '@/modules/documents/application/document-cleanup-ops-worker';

function planRow(documentId: string) {
  return {
    documentId,
    storageBackend: 'external' as const,
    storageKey: 'file-1',
    attempts: 2,
    lastError: 'boom',
    lastAttemptedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('runDocumentCleanupOpsWorker (D03 report-only)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('always returns report mode and aggregates candidates across orgs', async () => {
    mocks.listActiveOrganizationIds.mockResolvedValue([
      { id: 'org-a', defaultLocale: 'he-IL' },
      { id: 'org-b', defaultLocale: 'en' },
    ]);
    mocks.findActiveOrgOwnerUserId.mockImplementation(async (_db, orgId: string) =>
      orgId === 'org-a' ? { userId: 'owner-a' } : { userId: 'owner-b' },
    );
    mocks.planFailedDocumentCleanups.mockImplementation(async (context: { organizationId: string }) => {
      if (context.organizationId === 'org-a') return [planRow('doc-a1'), planRow('doc-a2')];
      return [planRow('doc-b1')];
    });

    const report = await runDocumentCleanupOpsWorker({ limitPerOrg: 25 });

    expect(report).toEqual({
      mode: 'report',
      orgsScanned: 2,
      candidates: 3,
      sample: [planRow('doc-a1'), planRow('doc-a2'), planRow('doc-b1')],
    });
    expect(mocks.planFailedDocumentCleanups).toHaveBeenCalledTimes(2);
    expect(mocks.planFailedDocumentCleanups).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a' }),
      { limit: 25 },
    );
  });

  it('caps the returned sample at ten rows even when one org returns more', async () => {
    mocks.listActiveOrganizationIds.mockResolvedValue([{ id: 'org-heavy', defaultLocale: 'he-IL' }]);
    mocks.findActiveOrgOwnerUserId.mockResolvedValue({ userId: 'owner' });
    mocks.planFailedDocumentCleanups.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) => planRow(`doc-${index}`)),
    );

    const report = await runDocumentCleanupOpsWorker({ limitPerOrg: 50 });

    expect(report.orgsScanned).toBe(1);
    expect(report.candidates).toBe(15);
    expect(report.sample).toHaveLength(10);
    expect(report.sample[0]?.documentId).toBe('doc-0');
    expect(report.sample[9]?.documentId).toBe('doc-9');
  });

  it('skips orgs without an active owner', async () => {
    mocks.listActiveOrganizationIds.mockResolvedValue([
      { id: 'org-a', defaultLocale: 'he-IL' },
      { id: 'org-b', defaultLocale: 'he-IL' },
    ]);
    mocks.findActiveOrgOwnerUserId.mockImplementation(async (_db, orgId: string) =>
      orgId === 'org-a' ? { userId: 'owner-a' } : null,
    );
    mocks.planFailedDocumentCleanups.mockResolvedValue([planRow('only-a')]);

    const report = await runDocumentCleanupOpsWorker();

    expect(report.candidates).toBe(1);
    expect(mocks.planFailedDocumentCleanups).toHaveBeenCalledOnce();
  });

  it('continues scanning when one org throws', async () => {
    mocks.listActiveOrganizationIds.mockResolvedValue([
      { id: 'org-a', defaultLocale: 'he-IL' },
      { id: 'org-b', defaultLocale: 'he-IL' },
    ]);
    mocks.findActiveOrgOwnerUserId.mockResolvedValue({ userId: 'owner' });
    mocks.planFailedDocumentCleanups.mockImplementation(async (context: { organizationId: string }) => {
      if (context.organizationId === 'org-a') throw new Error('plan failed');
      return [planRow('doc-b')];
    });

    const report = await runDocumentCleanupOpsWorker();

    expect(report).toMatchObject({
      mode: 'report',
      orgsScanned: 2,
      candidates: 1,
      sample: [planRow('doc-b')],
    });
  });
});
