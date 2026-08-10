import { describe, expect, it } from 'vitest';
import {
  applyConflictResolution,
  assertNeverSilentOverwrite,
  canPrepareServerMutation,
  detectConflict,
  OfflineConflictError,
  shouldBlockAutoSync,
} from '@/modules/offline/domain/conflict';
import {
  mergeDeserializedWithExisting,
  OfflineSerializeError,
  parseQueuedAction,
  serializeQueuedAction,
  toQueuedAction,
} from '@/modules/offline/domain/serialize';
import type { OfflineDraftRecord } from '@/modules/offline/domain/types';
import { createDraftQueue } from '@/modules/offline';
import { createMemoryDraftStore } from '@/modules/offline';

function sampleDraft(
  overrides: Partial<OfflineDraftRecord> = {},
): OfflineDraftRecord {
  return {
    localId: 'local-1',
    organizationId: 'org-1',
    userId: 'user-1',
    kind: 'expense',
    payload: { amount: '10.00', currency: 'ILS' },
    updatedAt: '2026-08-09T10:00:00.000Z',
    syncStatus: 'queued',
    serverId: 'srv-1',
    serverUpdatedAt: '2026-08-09T09:00:00.000Z',
    conflictReason: null,
    serverSnapshot: null,
    dedupeKey: null,
    ...overrides,
  };
}

describe('offline queue serialize', () => {
  it('round-trips a queued action without losing fields', () => {
    const draft = sampleDraft();
    const raw = serializeQueuedAction(draft);
    const parsed = parseQueuedAction(raw);

    expect(parsed).toEqual(toQueuedAction(draft));
  });

  it('rejects malformed JSON and unknown kinds', () => {
    expect(() => parseQueuedAction('{')).toThrow(OfflineSerializeError);
    expect(() =>
      parseQueuedAction(
        JSON.stringify({
          localId: 'x',
          organizationId: 'o',
          userId: 'u',
          kind: 'invoice',
          payload: {},
          updatedAt: '2026-08-09T10:00:00.000Z',
          syncStatus: 'queued',
          serverId: null,
          serverUpdatedAt: null,
          dedupeKey: null,
        }),
      ),
    ).toThrow(OfflineSerializeError);
  });

  it('never replaces a conflicted local record with a deserialized queued action', () => {
    const existing = sampleDraft({
      syncStatus: 'conflict',
      payload: { amount: '12.00', currency: 'ILS' },
      updatedAt: '2026-08-09T11:00:00.000Z',
    });
    const incoming = toQueuedAction(
      sampleDraft({
        syncStatus: 'queued',
        payload: { amount: '99.00', currency: 'ILS' },
        updatedAt: '2026-08-09T12:00:00.000Z',
      }),
    );

    const merged = mergeDeserializedWithExisting(existing, incoming);
    expect(merged.syncStatus).toBe('conflict');
    expect(merged.payload).toEqual({ amount: '12.00', currency: 'ILS' });
    expect(merged.updatedAt).toBe('2026-08-09T11:00:00.000Z');
  });
});

describe('offline conflict rules', () => {
  it('detects when server advanced past the draft baseline', () => {
    const draft = sampleDraft();
    expect(
      detectConflict(draft, {
        serverId: 'srv-1',
        serverUpdatedAt: '2026-08-09T09:30:00.000Z',
      }),
    ).toBe(true);
    expect(
      detectConflict(draft, {
        serverId: 'srv-1',
        serverUpdatedAt: '2026-08-09T09:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('treats a linked draft without a baseline as conflicting', () => {
    expect(
      detectConflict(
        sampleDraft({ serverUpdatedAt: null }),
        { serverId: 'srv-1', serverUpdatedAt: '2026-08-09T09:00:00.000Z' },
      ),
    ).toBe(true);
  });

  it('refuses silent overwrite of server truth', () => {
    expect(() =>
      assertNeverSilentOverwrite({ wouldOverwriteServer: true, userConfirmed: false }),
    ).toThrow(OfflineConflictError);

    expect(() =>
      assertNeverSilentOverwrite({ wouldOverwriteServer: true, userConfirmed: true }),
    ).not.toThrow();
  });

  it('blocks auto sync on conflict unless the user confirms overwrite', () => {
    const draft = sampleDraft();
    const server = {
      serverId: 'srv-1',
      serverUpdatedAt: '2026-08-09T12:00:00.000Z',
    };
    expect(shouldBlockAutoSync(draft, server)).toBe(true);
    expect(canPrepareServerMutation(draft, server)).toBe(false);
    expect(
      canPrepareServerMutation(draft, server, { userConfirmedOverwrite: true }),
    ).toBe(true);
  });

  it('allows create-candidates with no server id', () => {
    const draft = sampleDraft({ serverId: null, serverUpdatedAt: null });
    expect(canPrepareServerMutation(draft, null)).toBe(true);
  });

  it('resolves conflicts without inventing a server overwrite', () => {
    const conflicted = sampleDraft({ syncStatus: 'conflict', conflictReason: 'stale' });
    expect(applyConflictResolution(conflicted, 'discard_local')).toBeNull();

    const kept = applyConflictResolution(conflicted, 'keep_local_as_candidate', '2026-08-09T13:00:00.000Z');
    expect(kept).toMatchObject({
      serverId: null,
      serverUpdatedAt: null,
      syncStatus: 'queued',
      conflictReason: null,
      updatedAt: '2026-08-09T13:00:00.000Z',
    });
  });
});

describe('offline draft queue', () => {
  it('enqueues, lists, marks synced, and marks conflict without auto-overwrite', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());

    const created = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'time_entry',
      payload: { hours: '2' },
      serverId: 'te-1',
      serverUpdatedAt: '2026-08-09T08:00:00.000Z',
    });
    expect(created.syncStatus).toBe('queued');

    const listed = await queue.list({ organizationId: 'org-1', userId: 'user-1' });
    expect(listed).toHaveLength(1);

    const prepared = await queue.prepareForSync(created.localId, {
      serverId: 'te-1',
      serverUpdatedAt: '2026-08-09T09:00:00.000Z',
    });
    expect(prepared.blocked).toBe(true);
    expect(prepared.draft.syncStatus).toBe('conflict');

    await expect(
      queue.markSynced(created.localId, {
        serverId: 'te-1',
        serverUpdatedAt: '2026-08-09T09:00:00.000Z',
      }),
    ).rejects.toThrow(OfflineConflictError);

    const requeued = await queue.resolveConflict(created.localId, 'keep_local_as_candidate');
    expect(requeued?.syncStatus).toBe('queued');
    expect(requeued?.serverId).toBeNull();

    const synced = await queue.markSynced(created.localId, {
      serverId: 'te-new',
      serverUpdatedAt: '2026-08-09T14:00:00.000Z',
    });
    expect(synced.syncStatus).toBe('synced');

    const pending = await queue.list({ organizationId: 'org-1', userId: 'user-1', pendingOnly: true });
    expect(pending).toHaveLength(0);
  });

  it('preserves conflict status when enqueue updates payload', async () => {
    const store = createMemoryDraftStore([
      sampleDraft({ syncStatus: 'conflict', conflictReason: 'manual' }),
    ]);
    const queue = createDraftQueue(store);

    const updated = await queue.enqueue({
      localId: 'local-1',
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'expense',
      payload: { amount: '20.00', currency: 'ILS' },
    });

    expect(updated.syncStatus).toBe('conflict');
    expect(updated.conflictReason).toBe('manual');
    expect(updated.payload).toEqual({ amount: '20.00', currency: 'ILS' });
  });

  it('counts drafts by status for the settings panel', async () => {
    const queue = createDraftQueue(
      createMemoryDraftStore([
        sampleDraft({ localId: 'a', syncStatus: 'queued', kind: 'daily_log' }),
        sampleDraft({
          localId: 'b',
          syncStatus: 'conflict',
          kind: 'change_request',
        }),
        sampleDraft({ localId: 'c', syncStatus: 'synced', kind: 'expense' }),
      ]),
    );

    const counts = await queue.countsByStatus({ organizationId: 'org-1', userId: 'user-1' });
    expect(counts.queued).toBe(1);
    expect(counts.conflict).toBe(1);
    expect(counts.synced).toBe(1);
  });
});
