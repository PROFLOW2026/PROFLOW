import { describe, expect, it, vi } from 'vitest';
import {
  buildDedupeKey,
  findDuplicatePending,
  shouldBlockDuplicateWhileSyncing,
} from '@/modules/offline/domain/dedupe';
import {
  assertDraftMatchesScope,
  matchesDraftScope,
  OfflineScopeError,
} from '@/modules/offline/domain/scope';
import { detectConflict } from '@/modules/offline/domain/conflict';
import { isSensitiveFinancialPath, shouldUseCacheFirst } from '@/modules/offline/domain/sw-policy';
import type { OfflineDraftRecord } from '@/modules/offline/domain/types';
import { createDraftQueue, createMemoryDraftStore, runQueuedSync } from '@/modules/offline';
import { createMemoryAttachmentStore } from '@/modules/offline';
import type { OfflineSyncTransport } from '@/modules/offline';

function sampleDraft(overrides: Partial<OfflineDraftRecord> = {}): OfflineDraftRecord {
  return {
    localId: 'local-1',
    organizationId: 'org-1',
    userId: 'user-1',
    kind: 'expense',
    payload: { amount: '10.00', currency: 'ILS' },
    updatedAt: '2026-08-09T10:00:00.000Z',
    syncStatus: 'queued',
    serverId: null,
    serverUpdatedAt: null,
    conflictReason: null,
    serverSnapshot: null,
    dedupeKey: 'dedupe:test',
    ...overrides,
  };
}

describe('offline tenant/user scoping', () => {
  it('matches only same organization and user', () => {
    const draft = sampleDraft();
    expect(matchesDraftScope(draft, { organizationId: 'org-1', userId: 'user-1' })).toBe(true);
    expect(matchesDraftScope(draft, { organizationId: 'org-2', userId: 'user-1' })).toBe(false);
    expect(matchesDraftScope(draft, { organizationId: 'org-1', userId: 'user-2' })).toBe(false);
    expect(
      matchesDraftScope(sampleDraft({ userId: '' }), { organizationId: 'org-1', userId: 'user-1' }),
    ).toBe(false);
  });

  it('lists and counts only the active user within an org', async () => {
    const queue = createDraftQueue(
      createMemoryDraftStore([
        sampleDraft({ localId: 'a', userId: 'user-1' }),
        sampleDraft({ localId: 'b', userId: 'user-2', payload: { amount: '1' } }),
      ]),
    );

    const mine = await queue.list({ organizationId: 'org-1', userId: 'user-1' });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.localId).toBe('a');

    const counts = await queue.countsByStatus({ organizationId: 'org-1', userId: 'user-1' });
    expect(counts.queued).toBe(1);
  });

  it('refuses enqueue/edit across users and claims legacy unscoped rows', async () => {
    const store = createMemoryDraftStore([
      sampleDraft({ localId: 'legacy', userId: '', syncStatus: 'queued' }),
      sampleDraft({ localId: 'other', userId: 'user-2' }),
    ]);
    const queue = createDraftQueue(store);

    await expect(
      queue.enqueue({
        localId: 'other',
        organizationId: 'org-1',
        userId: 'user-1',
        kind: 'expense',
        payload: { amount: '2' },
      }),
    ).rejects.toBeInstanceOf(OfflineScopeError);

    const claimed = await queue.claimUnscopedDrafts({ organizationId: 'org-1', userId: 'user-1' });
    expect(claimed).toBe(1);
    expect((await queue.get('legacy'))?.userId).toBe('user-1');
  });

  it('assertDraftMatchesScope blocks foreign drafts before sync', () => {
    expect(() =>
      assertDraftMatchesScope(sampleDraft({ userId: 'user-2' }), {
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).toThrow(OfflineScopeError);
  });
});

describe('offline queue dedupe', () => {
  it('builds a stable fingerprint ignoring whitespace/key order', () => {
    const a = buildDedupeKey({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'daily_log',
      payload: { summary: ' rain ', projectId: 'p1' },
    });
    const b = buildDedupeKey({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'daily_log',
      payload: { projectId: 'p1', summary: 'rain' },
    });
    expect(a).toBe(b);
  });

  it('collapses duplicate pending enqueues into one local draft', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const first = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'punch',
      payload: { projectId: 'p1', title: 'Leak', description: null },
    });
    const second = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'punch',
      payload: { projectId: 'p1', title: 'Leak', description: null },
    });

    expect(second.localId).toBe(first.localId);
    const pending = await queue.list({ organizationId: 'org-1', userId: 'user-1' });
    expect(pending).toHaveLength(1);
  });

  it('blocks duplicate enqueue while syncing the same fingerprint', () => {
    const existing = sampleDraft({ syncStatus: 'syncing', dedupeKey: 'dedupe:abc' });
    expect(shouldBlockDuplicateWhileSyncing(existing, 'dedupe:abc')).toBe(true);
    expect(shouldBlockDuplicateWhileSyncing(existing, 'dedupe:other')).toBe(false);
    expect(
      findDuplicatePending([existing], 'dedupe:abc')?.localId,
    ).toBe('local-1');
  });
});

describe('offline conflict + failed recovery', () => {
  it('detects conflicts and keeps rejected drafts editable/retryable', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const created = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'inspection',
      payload: { projectId: 'p1', title: 'Fire stop', notes: 'north' },
      serverId: 'insp-1',
      serverUpdatedAt: '2026-08-09T08:00:00.000Z',
    });

    expect(
      detectConflict(created, {
        serverId: 'insp-1',
        serverUpdatedAt: '2026-08-09T09:00:00.000Z',
      }),
    ).toBe(true);

    await queue.markRejected(created.localId, 'validation failed');
    const rejected = await queue.get(created.localId);
    expect(rejected?.syncStatus).toBe('rejected');

    const edited = await queue.updateUnsynced(
      created.localId,
      { organizationId: 'org-1', userId: 'user-1' },
      { projectId: 'p1', title: 'Fire stop fixed', notes: 'north' },
    );
    expect(edited.syncStatus).toBe('rejected');
    expect(edited.payload.title).toBe('Fire stop fixed');

    const retried = await queue.retryFailed(created.localId, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(retried.syncStatus).toBe('queued');

    await queue.deleteUnsynced(created.localId, { organizationId: 'org-1', userId: 'user-1' });
    expect(await queue.get(created.localId)).toBeUndefined();
  });

  it('marks submit failures as rejected (not conflict) and skips them on next drain', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const created = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'time_entry',
      payload: { hours: '2', employeeId: 'e1', workDate: '2026-08-09', kind: 'project' },
    });

    const transport: OfflineSyncTransport = {
      async fetchServerTruth() {
        return null;
      },
      async submit() {
        throw new Error('Server validation failed');
      },
    };

    const run = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });

    expect(run.results[0]).toMatchObject({
      localId: created.localId,
      status: 'rejected',
    });
    expect((await queue.get(created.localId))?.syncStatus).toBe('rejected');

    const second = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });
    expect(second.attempted).toBe(0);
  });

  it('does not re-submit synced drafts (duplicate submission protection)', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'expense',
      payload: { amount: '5.00', currency: 'ILS' },
    });

    const submit = vi.fn(async () => ({
      serverId: 'exp-1',
      serverUpdatedAt: '2026-08-09T16:00:00.000Z',
    }));

    const transport: OfflineSyncTransport = {
      async fetchServerTruth() {
        return null;
      },
      submit,
    };

    await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });
    await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('offline SW sensitive financial paths', () => {
  it('never cache-firsts billing/financial routes', () => {
    expect(isSensitiveFinancialPath('/he-IL/billing/invoices')).toBe(true);
    expect(isSensitiveFinancialPath('/en/procurement/ap/bills')).toBe(true);
    expect(isSensitiveFinancialPath('/he-IL/reports')).toBe(true);
    expect(isSensitiveFinancialPath('/en/month-close')).toBe(true);
    expect(isSensitiveFinancialPath('/he-IL/quotes/abc')).toBe(true);
    expect(isSensitiveFinancialPath('/he-IL/documents/ocr-review')).toBe(true);
    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/he-IL/financials/profit',
      }),
    ).toBe(false);
    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/offline.html',
      }),
    ).toBe(true);
  });
});
