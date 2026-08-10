import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/shared/auth/session', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: { organizationId: string }) => Promise<unknown>) =>
    fn({ organizationId: 'org-session' })),
}));

vi.mock('@/modules/expenses', () => ({
  createExpense: vi.fn(),
  createExpenseSchema: { safeParse: () => ({ success: false }) },
  getExpense: vi.fn(),
  updateExpense: vi.fn(),
  updateExpenseSchema: { safeParse: () => ({ success: false }) },
}));

vi.mock('@/modules/workforce', () => ({
  createTimeEntry: vi.fn(),
  createTimeEntrySchema: { safeParse: () => ({ success: false }) },
}));

vi.mock('@/modules/workforce/data/time-entries.repository', () => ({
  findTimeEntryById: vi.fn(),
}));

vi.mock('@/modules/commercial', () => ({
  createChangeRequest: vi.fn(),
  getChangeRequestDetail: vi.fn(),
  updateChangeRequest: vi.fn(),
}));

vi.mock('@/modules/field-ops', () => ({
  createDailyLog: vi.fn(),
  getDailyLogForOrg: vi.fn(),
  updateDailyLog: vi.fn(),
  createPunchListItem: vi.fn(),
  getPunchListItemForOrg: vi.fn(),
  updatePunchListItem: vi.fn(),
  createInspection: vi.fn(),
  getInspectionForOrg: vi.fn(),
  updateInspection: vi.fn(),
}));

vi.mock('@/modules/field-ops/validation/schemas', () => ({
  createPunchListItemSchema: { safeParse: () => ({ success: false }) },
  createInspectionSchema: { safeParse: () => ({ success: false }) },
}));

vi.mock('@/modules/documents', () => ({
  getDocumentById: vi.fn(),
}));

import {
  OfflineSyncSubmitError,
  submitOfflineDraftAction,
} from '@/modules/offline/application/sync-mutations';

describe('offline draft tenancy', () => {
  it('rejects drafts queued for a different organization than the session', async () => {
    await expect(
      submitOfflineDraftAction({
        kind: 'expense',
        serverId: null,
        payload: {},
        localId: 'local-1',
        organizationId: 'org-other',
        userId: 'user-session',
        updatedAt: new Date().toISOString(),
        syncStatus: 'queued',
        serverUpdatedAt: null,
      }),
    ).rejects.toBeInstanceOf(OfflineSyncSubmitError);

    await expect(
      submitOfflineDraftAction({
        kind: 'expense',
        serverId: null,
        payload: {},
        localId: 'local-1',
        organizationId: 'org-other',
        userId: 'user-session',
        updatedAt: new Date().toISOString(),
        syncStatus: 'queued',
        serverUpdatedAt: null,
      }),
    ).rejects.toThrow(/does not match the active organization/i);
  });
});
