import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalStatutoryDocument } from '@/modules/invoicing-integration/domain/types';

const ORG_ID = '01900000-0000-7000-8000-0000000000w1';
const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const refreshMock = vi.fn();
const listAmbiguousMock = vi.fn();

vi.mock('@/shared/db/client', () => ({
  getAdminDb: () => ({
    selectDistinct: () => ({
      from: () => ({
        where: () => Promise.resolve([{ organizationId: ORG_ID }]),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
  withUserContext: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

vi.mock('@/modules/tenancy', () => ({
  resolveOrgContext: async () =>
    ({
      organizationId: ORG_ID,
      userId: 'owner-user',
    }) as OrgContext,
}));

vi.mock('@/modules/recurring-drafts/application/ops-worker', () => ({
  findActiveOrgOwnerUserId: vi.fn(async () => ({ userId: 'owner-user' })),
}));

vi.mock('@/modules/invoicing-integration/data/external-documents', () => ({
  listExternalDocumentsByIssuanceOutcome: (...args: unknown[]) => listAmbiguousMock(...args),
}));

vi.mock('@/modules/invoicing-integration/application/refresh-external-status', () => ({
  refreshExternalStatutoryStatus: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock('@/modules/invoicing-integration/application/archive-statutory-pdf-to-provider', () => ({
  retryPendingStatutoryPdfArchival: vi.fn(),
}));

import { runSumitRecoveryOpsWorker } from '@/modules/invoicing-integration/application/sumit-recovery-ops-worker';

function ambiguousDoc(id: string): ExternalStatutoryDocument {
  return {
    id,
    organizationId: ORG_ID,
    billingRecordId: 'billing-1',
    paymentId: null,
    providerId: 'sumit',
    kind: 'tax_invoice',
    status: 'pending',
    issuanceOutcome: 'ambiguous',
    externalId: null,
    externalNumber: null,
    externalUrl: null,
    pdf: null,
    allocationReference: null,
    reconciliationStatus: 'not_available',
    reconciliationMetadata: null,
    idempotencyKey: `pf:${id}:tax_invoice:v1`,
    lastErrorCode: null,
    lastErrorMessage: null,
    requestedAt: STALE,
    updatedAt: STALE,
    issuedAt: null,
    storageReference: null,
    archivedAt: null,
    archivePending: false,
    archiveError: null,
  };
}

describe('SUMIT recovery ops worker (B02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAmbiguousMock.mockResolvedValue([
      ambiguousDoc('doc-with-id'),
      ambiguousDoc('doc-recovered'),
      ambiguousDoc('doc-still-ambiguous'),
    ]);
    refreshMock.mockImplementation(async (_ctx: OrgContext, input: { externalDocumentId: string }) => {
      if (input.externalDocumentId === 'doc-recovered') {
        return { ...ambiguousDoc('doc-recovered'), issuanceOutcome: 'confirmed_created', externalId: '9001' };
      }
      if (input.externalDocumentId === 'doc-with-id') {
        return { ...ambiguousDoc('doc-with-id'), issuanceOutcome: 'confirmed_created', externalId: '9000' };
      }
      return ambiguousDoc('doc-still-ambiguous');
    });
  });

  it('resolves ambiguous rows via refresh scan without creating documents', async () => {
    const result = await runSumitRecoveryOpsWorker();

    expect(result.scanned).toBe(1);
    expect(result.resolved).toBe(2);
    expect(result.still_ambiguous).toBe(1);
    expect(result.failed).toBe(0);
    expect(refreshMock).toHaveBeenCalledTimes(3);
  });

  it('counts refresh failures as still_ambiguous', async () => {
    refreshMock.mockRejectedValueOnce(new Error('SUMIT list timeout'));
    listAmbiguousMock.mockResolvedValue([ambiguousDoc('doc-fail')]);

    const result = await runSumitRecoveryOpsWorker();

    expect(result.still_ambiguous).toBe(1);
    expect(result.resolved).toBe(0);
  });
});
