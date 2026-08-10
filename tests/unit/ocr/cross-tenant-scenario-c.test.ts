import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/documents/data/documents.repository', () => ({
  findDocumentById: vi.fn(async (_db: unknown, organizationId: string, documentId: string) => {
    // Org A owns document-a; Org B owns document-b.
    if (
      organizationId === 'org-a' &&
      documentId === '01900000-0000-7000-8000-0000000000a1'
    ) {
      return {
        id: documentId,
        organizationId,
        status: 'available',
        deletedAt: null,
      };
    }
    if (
      organizationId === 'org-b' &&
      documentId === '01900000-0000-7000-8000-0000000000b1'
    ) {
      return {
        id: documentId,
        organizationId,
        status: 'available',
        deletedAt: null,
      };
    }
    return null;
  }),
}));

import {
  ScriptedOcrProvider,
  buildFixtureCandidates,
  confirmOcrCandidate,
  extractReceiptJob,
  findJob,
  listOcrCandidates,
  resetOcrStoreForTests,
  seedFixtureJob,
  setOcrPersistenceReadyForTests,
} from '@/modules/ocr';

function contextWith(
  organizationId: string,
  permissions: readonly PermissionKey[],
): OrgContext {
  return {
    userId: 'user-1',
    organizationId,
    membershipId: 'membership-1',
    organization: {
      id: organizationId,
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

describe('scenario C — OCR cross-tenant guards', () => {
  beforeEach(() => {
    setOcrPersistenceReadyForTests(false);
    resetOcrStoreForTests();
  });

  afterEach(() => {
    setOcrPersistenceReadyForTests(true);
  });

  it('rejects extract when documentId belongs to another organization', async () => {
    const ctx = contextWith('org-a', [PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());

    await expect(
      extractReceiptJob(
        ctx,
        {
          documentId: '01900000-0000-7000-8000-0000000000b1',
          filename: 'foreign.pdf',
        },
        provider,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not list or find jobs across organizations', async () => {
    const jobA = seedFixtureJob({
      organizationId: 'org-a',
      candidates: buildFixtureCandidates(),
    });
    seedFixtureJob({
      organizationId: 'org-b',
      candidates: buildFixtureCandidates(),
    });

    const listA = await listOcrCandidates(
      contextWith('org-a', [PERMISSIONS.DOCUMENTS_READ]),
      { status: 'needs_review' },
    );
    expect(listA.every((j) => j.organizationId === 'org-a')).toBe(true);
    expect(listA.some((j) => j.id === jobA.id)).toBe(true);

    expect(findJob('org-b', jobA.id)).toBeNull();
    expect(findJob('org-a', jobA.id)?.id).toBe(jobA.id);
  });

  it('confirm cannot reach another org job id', async () => {
    const jobB = seedFixtureJob({
      organizationId: 'org-b',
      candidates: buildFixtureCandidates(),
    });
    const createExpense = vi.fn(async () => ({ id: 'should-not-create' }));

    await expect(
      confirmOcrCandidate(
        contextWith('org-a', [PERMISSIONS.EXPENSES_CREATE]),
        {
          jobId: jobB.id,
          confirm: true,
          acceptedFields: ['vendor', 'gross', 'currency', 'date', 'description', 'net', 'tax'],
        },
        { createExpense },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(createExpense).not.toHaveBeenCalled();
  });
});
