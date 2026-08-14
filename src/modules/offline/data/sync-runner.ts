import type { OfflineDraftRecord, QueuedAction, ServerTruthHint } from '../domain/types';
import { assertDraftMatchesScope } from '../domain/scope';
import { toQueuedAction } from '../domain/serialize';
import {
  compareDraftsForSync,
  ownerIdFromCapturePayload,
  pendingOwnerDraftLocalIdFromPayload,
} from '../domain/sync-order';
import type { AttachmentStore, OfflineAttachmentRecord } from './attachment-store';
import { getDefaultAttachmentStore } from './attachment-store';
import type { DraftQueue } from './draft-queue';
import { getDraftQueue } from './draft-queue';
import { mirrorDraftsToLocalStorage } from './queue-index';

export type SyncOutcomeStatus = 'synced' | 'conflict' | 'rejected' | 'skipped' | 'failed';

export interface SyncItemResult {
  readonly localId: string;
  readonly status: SyncOutcomeStatus;
  readonly reason?: string;
}

export interface SyncRunResult {
  readonly attempted: number;
  readonly results: readonly SyncItemResult[];
}

/** Thrown by placeholder transports — draft stays queued, not conflicted. */
export class OfflineSyncNotWiredError extends Error {
  constructor(message = 'Offline sync transport is not wired for this draft kind yet.') {
    super(message);
    this.name = 'OfflineSyncNotWiredError';
  }
}

/**
 * Pluggable transport — Wave 4 foundations call this; feature owners wire
 * real server actions per draft kind. Must never last-write-wins overwrite.
 */
export interface OfflineSyncTransport {
  /**
   * Return current server truth for an update-candidate, or null for creates /
   * when the server row does not exist.
   */
  fetchServerTruth(action: QueuedAction): Promise<ServerTruthHint | null>;
  /**
   * Submit a create/update candidate. Throw OfflineSyncNotWiredError to skip
   * without poisoning the draft. Other errors become rejected/conflict.
   * Must not mutate when the caller already marked the draft as conflicted.
   */
  submit(
    action: QueuedAction,
    attachments: readonly OfflineAttachmentRecord[],
  ): Promise<{ readonly serverId: string; readonly serverUpdatedAt: string }>;
}

export interface RunQueuedSyncOptions {
  readonly organizationId: string;
  readonly userId: string;
  readonly transport: OfflineSyncTransport;
  readonly queue?: DraftQueue;
  readonly attachments?: AttachmentStore;
  /** Cap work per reconnect pass. */
  readonly limit?: number;
}

/**
 * Drain queued drafts after reconnect. Conflicted / rejected items are skipped.
 * Server truth wins unless the user already resolved via keep_local_as_candidate.
 */
export async function runQueuedSync(options: RunQueuedSyncOptions): Promise<SyncRunResult> {
  const queue = options.queue ?? getDraftQueue();
  const attachments = options.attachments ?? getDefaultAttachmentStore();
  const limit = options.limit ?? 25;
  const scope = { organizationId: options.organizationId, userId: options.userId };

  const pending = (
    await queue.list({
      organizationId: options.organizationId,
      userId: options.userId,
      syncStatus: ['queued', 'draft'],
      pendingOnly: false,
    })
  ).slice()
    .sort(compareDraftsForSync);

  const results: SyncItemResult[] = [];
  let attempted = 0;

  for (const draft of pending.slice(0, limit)) {
    attempted += 1;
    try {
      assertDraftMatchesScope(draft, scope);

      let captureOwnerId: string | null = null;
      if (draft.kind === 'capture') {
        const parentLocalId = pendingOwnerDraftLocalIdFromPayload(draft.payload);
        let parentServerId: string | null = null;
        if (parentLocalId) {
          const parent = await queue.get(parentLocalId);
          parentServerId = parent?.serverId ?? null;
          if (!ownerIdFromCapturePayload(draft.payload, null) && !parentServerId) {
            results.push({
              localId: draft.localId,
              status: 'skipped',
              reason: 'Waiting for owner record to sync.',
            });
            continue;
          }
        }
        captureOwnerId = ownerIdFromCapturePayload(draft.payload, parentServerId);
      }

      const action = toQueuedAction(draft);
      const serverTruth = await options.transport.fetchServerTruth(action);
      const prepared = await queue.prepareForSync(draft.localId, serverTruth);
      if (prepared.blocked) {
        results.push({
          localId: draft.localId,
          status: prepared.draft.syncStatus === 'rejected' ? 'rejected' : 'conflict',
          reason: prepared.draft.conflictReason ?? 'Server truth advanced; awaiting user choice.',
        });
        continue;
      }

      const blobs =
        draft.kind === 'capture'
          ? await attachments.listByDraft(draft.localId)
          : [];

      const submitAction = captureOwnerId
        ? {
            ...toQueuedAction(prepared.draft),
            payload: { ...prepared.draft.payload, ownerId: captureOwnerId },
          }
        : toQueuedAction(prepared.draft);

      try {
        const submitted = await options.transport.submit(submitAction, blobs);
        await queue.markSynced(draft.localId, submitted);
        if (draft.kind === 'capture') {
          await attachments.deleteByDraft(draft.localId);
        }
        results.push({ localId: draft.localId, status: 'synced' });
      } catch (error) {
        if (error instanceof OfflineSyncNotWiredError) {
          // Revert syncing → queued so a later wired transport can retry.
          await queue.enqueue({
            localId: prepared.draft.localId,
            organizationId: prepared.draft.organizationId,
            userId: prepared.draft.userId,
            kind: prepared.draft.kind,
            payload: prepared.draft.payload,
            serverId: prepared.draft.serverId,
            serverUpdatedAt: prepared.draft.serverUpdatedAt,
          });
          results.push({
            localId: draft.localId,
            status: 'skipped',
            reason: error.message,
          });
          continue;
        }
        const message = error instanceof Error ? error.message : 'Sync submit failed.';
        await queue.markRejected(draft.localId, message);
        results.push({ localId: draft.localId, status: 'rejected', reason: message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.';
      const current = await queue.get(draft.localId);
      if (current?.syncStatus === 'syncing') {
        await queue.enqueue({
          localId: current.localId,
          organizationId: current.organizationId,
          userId: current.userId,
          kind: current.kind,
          payload: current.payload,
          serverId: current.serverId,
          serverUpdatedAt: current.serverUpdatedAt,
        });
      }
      results.push({ localId: draft.localId, status: 'failed', reason: message });
    }
  }

  const all = await queue.list({
    organizationId: options.organizationId,
    userId: options.userId,
    pendingOnly: false,
  });
  mirrorDraftsToLocalStorage(all);

  return { attempted, results };
}

export interface ReconnectSyncController {
  stop(): void;
  /** Force a sync pass if currently online. */
  flush(): Promise<SyncRunResult | null>;
}

/**
 * Start listening for browser online events and drain the queue.
 * No-op transport stub is not registered — callers must pass a real transport
 * (or a stub that no-ops submit until feature owners land).
 */
export function startReconnectSync(options: {
  readonly organizationId: string;
  readonly userId: string;
  readonly transport: OfflineSyncTransport;
  readonly queue?: DraftQueue;
  readonly attachments?: AttachmentStore;
}): ReconnectSyncController {
  let running = false;
  let stopped = false;

  const flush = async (): Promise<SyncRunResult | null> => {
    if (stopped) return null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    if (running) return null;
    running = true;
    try {
      return await runQueuedSync(options);
    } finally {
      running = false;
    }
  };

  const onOnline = () => {
    void flush();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    // First pass shortly after mount if already online.
    void flush();
  }

  return {
    stop() {
      stopped = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
      }
    },
    flush,
  };
}

/**
 * Default transport that skips mutations — keeps foundations safe until
 * expense/time/change/daily-log/capture owners wire real submitters.
 */
export function createNoopSyncTransport(): OfflineSyncTransport {
  return {
    async fetchServerTruth() {
      return null;
    },
    async submit() {
      throw new OfflineSyncNotWiredError();
    },
  };
}

/** Helper for tests / UI: mark syncing status transition already covered by queue. */
export function isSyncableDraft(draft: Pick<OfflineDraftRecord, 'syncStatus'>): boolean {
  return draft.syncStatus === 'queued' || draft.syncStatus === 'draft';
}
