import { describe, expect, it, vi } from 'vitest';
import { OfflineCaptureError, buildCaptureEnqueueInput } from '@/modules/offline/domain/capture';
import {
  shouldServeOfflineFallback,
  shouldUseCacheFirst,
  shouldUseNetworkFirst,
  SHELL_PRECACHE_URLS,
} from '@/modules/offline/domain/sw-policy';
import {
  expensePayloadFromFormData,
  timeEntryPayloadFromFormData,
} from '@/modules/offline/domain/payloads';
import { createMemoryAttachmentStore } from '@/modules/offline';
import { isBrowserOnline } from '@/modules/offline';
import { createDraftQueue } from '@/modules/offline';
import { createMemoryDraftStore } from '@/modules/offline';
import { enqueueCaptureDraft } from '@/modules/offline';
import { enqueueProductDraft } from '@/modules/offline';
import {
  createNoopSyncTransport,
  OfflineSyncNotWiredError,
  runQueuedSync,
  type OfflineSyncTransport,
} from '@/modules/offline';

describe('offline capture drafts', () => {
  it('rejects disallowed mime types before enqueue', () => {
    expect(() =>
      buildCaptureEnqueueInput({
        organizationId: 'org-1',
        userId: 'user-1',
        attachmentLocalId: 'att-1',
        file: {
          fileName: 'x.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 10,
        },
      }),
    ).toThrow(OfflineCaptureError);
  });

  it('stores capture metadata and blob separately', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const attachments = createMemoryAttachmentStore();
    const blob = new Blob(['hello'], { type: 'image/jpeg' });

    const result = await enqueueCaptureDraft(
      {
        organizationId: 'org-1',
        userId: 'user-1',
        file: blob,
        fileName: 'site.jpg',
        mimeType: 'image/jpeg',
        note: 'north wall',
      },
      { queue, attachments },
    );

    expect(result.draft.kind).toBe('capture');
    expect(result.draft.syncStatus).toBe('queued');
    expect(result.draft.payload.fileName).toBe('site.jpg');
    expect(result.attachment.sizeBytes).toBe(blob.size);

    const listed = await attachments.listByDraft(result.draft.localId);
    expect(listed).toHaveLength(1);
  });
});

describe('offline product enqueue', () => {
  it('queues expense drafts without inventing sync success', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const draft = await enqueueProductDraft(
      {
        organizationId: 'org-1',
        userId: 'user-1',
        kind: 'expense',
        payload: { amount: '12.50', currency: 'ILS' },
      },
      { queue },
    );

    expect(draft.syncStatus).toBe('queued');
    expect(draft.serverId).toBeNull();
    expect(draft.kind).toBe('expense');
  });

  it('parses form payloads for expense and time entry', () => {
    const expenseFd = new FormData();
    expenseFd.set('amount', '10');
    expenseFd.set('currency', 'ils');
    expenseFd.set('description', 'lunch');
    expect(expensePayloadFromFormData(expenseFd)).toMatchObject({
      amount: '10',
      currency: 'ils',
      description: 'lunch',
    });

    const timeFd = new FormData();
    timeFd.set('employeeId', 'emp-1');
    timeFd.set('workDate', '2026-08-09');
    timeFd.set('hours', '8');
    timeFd.set('kind', 'project');
    timeFd.set('projectId', 'proj-1');
    expect(timeEntryPayloadFromFormData(timeFd)).toMatchObject({
      employeeId: 'emp-1',
      hours: '8',
      projectId: 'proj-1',
    });
  });
});

describe('offline reconnect sync', () => {
  it('blocks conflicted updates and never marks them synced', async () => {
    const store = createMemoryDraftStore();
    const queue = createDraftQueue(store);
    const created = await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'expense',
      payload: { amount: '5.00' },
      serverId: 'exp-1',
      serverUpdatedAt: '2026-08-09T08:00:00.000Z',
    });

    const transport: OfflineSyncTransport = {
      async fetchServerTruth() {
        return {
          serverId: 'exp-1',
          serverUpdatedAt: '2026-08-09T12:00:00.000Z',
          snapshot: { amount: '9.00' },
        };
      },
      async submit() {
        throw new Error('must not submit on conflict');
      },
    };

    const run = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });

    expect(run.results).toEqual([
      expect.objectContaining({ localId: created.localId, status: 'conflict' }),
    ]);
    const after = await queue.get(created.localId);
    expect(after?.syncStatus).toBe('conflict');
  });

  it('skips unwired transports without poisoning the queue', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'daily_log',
      payload: { notes: 'rain' },
    });

    const run = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport: createNoopSyncTransport(),
      queue,
      attachments: createMemoryAttachmentStore(),
    });

    expect(run.results[0]?.status).toBe('skipped');
    expect(run.results[0]?.reason).toMatch(/not wired/i);
    const pending = await queue.list({ organizationId: 'org-1', userId: 'user-1', pendingOnly: true });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.syncStatus).toBe('queued');
  });

  it('marks synced and clears capture blobs on success', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    const attachments = createMemoryAttachmentStore();
    const { draft } = await enqueueCaptureDraft(
      {
        organizationId: 'org-1',
        userId: 'user-1',
        file: new Blob(['img'], { type: 'image/png' }),
        fileName: 'a.png',
        mimeType: 'image/png',
      },
      { queue, attachments },
    );

    const transport: OfflineSyncTransport = {
      async fetchServerTruth() {
        return null;
      },
      async submit() {
        return {
          serverId: 'doc-1',
          serverUpdatedAt: '2026-08-09T15:00:00.000Z',
        };
      },
    };

    const run = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments,
    });
    expect(run.results[0]?.status).toBe('synced');
    expect(await attachments.listByDraft(draft.localId)).toHaveLength(0);
    expect((await queue.get(draft.localId))?.syncStatus).toBe('synced');
  });

  it('marks rejected when submit fails after conflict check passes', async () => {
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
      reason: 'Server validation failed',
    });
    expect((await queue.get(created.localId))?.syncStatus).toBe('rejected');
  });

  it('does not duplicate-create after a successful sync on the next pass', async () => {
    const queue = createDraftQueue(createMemoryDraftStore());
    await queue.enqueue({
      organizationId: 'org-1',
      userId: 'user-1',
      kind: 'change_request',
      payload: { title: 'Extra slab', projectId: 'p1', direction: 'addition' },
    });

    const submit = vi.fn(async () => ({
      serverId: 'cr-1',
      serverUpdatedAt: '2026-08-09T16:00:00.000Z',
    }));

    const transport: OfflineSyncTransport = {
      async fetchServerTruth() {
        return null;
      },
      submit,
    };

    const first = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });
    expect(first.results[0]?.status).toBe('synced');
    expect(submit).toHaveBeenCalledTimes(1);

    const second = await runQueuedSync({
      organizationId: 'org-1',
      userId: 'user-1',
      transport,
      queue,
      attachments: createMemoryAttachmentStore(),
    });
    expect(second.attempted).toBe(0);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('exposes OfflineSyncNotWiredError for transport authors', () => {
    expect(new OfflineSyncNotWiredError().name).toBe('OfflineSyncNotWiredError');
  });
});

describe('offline browser online helper', () => {
  it('treats missing navigator as online (SSR-safe)', () => {
    expect(isBrowserOnline()).toBe(true);
  });
});

describe('offline shell cache policy', () => {
  it('cache-first only for shell assets, never for navigations or the manifest', () => {
    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'navigate',
        pathname: '/offline.html',
      }),
    ).toBe(false);

    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/manifest.webmanifest',
      }),
    ).toBe(false);

    expect(
      shouldUseNetworkFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/manifest.webmanifest',
      }),
    ).toBe(true);

    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/offline.html',
      }),
    ).toBe(true);

    expect(
      shouldUseCacheFirst({
        method: 'GET',
        mode: 'cors',
        pathname: '/en/projects',
      }),
    ).toBe(false);

    expect(SHELL_PRECACHE_URLS).toContain('/offline.html');
    expect(SHELL_PRECACHE_URLS).not.toContain('/manifest.webmanifest');
    expect(
      shouldServeOfflineFallback({ method: 'GET', mode: 'navigate' }),
    ).toBe(true);
  });
});
