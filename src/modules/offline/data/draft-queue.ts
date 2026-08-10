import {
  applyConflictResolution,
  detectConflict,
  OfflineConflictError,
} from '../domain/conflict';
import {
  buildDedupeKey,
  findDuplicatePending,
  shouldBlockDuplicateWhileSyncing,
} from '../domain/dedupe';
import { assertValidScope, isUnscopedDraft, OfflineScopeError } from '../domain/scope';
import type {
  ConflictResolutionChoice,
  DraftKind,
  DraftScope,
  EnqueueDraftInput,
  OfflineDraftRecord,
  ServerTruthHint,
  SyncStatus,
} from '../domain/types';
import { PENDING_SYNC_STATUSES } from '../domain/types';
import type { DraftStore } from './draft-store';
import { getDefaultDraftStore } from './draft-store';

function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListDraftsFilter {
  readonly organizationId?: string;
  readonly userId?: string;
  readonly kind?: DraftKind;
  readonly syncStatus?: SyncStatus | readonly SyncStatus[];
  /** When true (default), hide already-synced records. */
  readonly pendingOnly?: boolean;
}

export interface DraftQueue {
  enqueue<TPayload extends Record<string, unknown>>(
    input: EnqueueDraftInput<TPayload>,
  ): Promise<OfflineDraftRecord<TPayload>>;
  list(filter?: ListDraftsFilter): Promise<OfflineDraftRecord[]>;
  get(localId: string): Promise<OfflineDraftRecord | undefined>;
  /** Edit payload of an unsynced draft; never touches synced server truth. */
  updateUnsynced(
    localId: string,
    scope: DraftScope,
    payload: Record<string, unknown>,
  ): Promise<OfflineDraftRecord>;
  /** Delete a local unsynced draft (and leave server untouched). */
  deleteUnsynced(localId: string, scope: DraftScope): Promise<void>;
  markSynced(
    localId: string,
    server: { readonly serverId: string; readonly serverUpdatedAt: string },
  ): Promise<OfflineDraftRecord>;
  markConflict(
    localId: string,
    reason: string,
    server?: ServerTruthHint | null,
  ): Promise<OfflineDraftRecord>;
  /** Submit/validation failure — recoverable via retryFailed. */
  markRejected(localId: string, reason: string): Promise<OfflineDraftRecord>;
  /**
   * Compare against server truth before sync. Marks conflict when needed and
   * never auto-overwrites.
   */
  prepareForSync(
    localId: string,
    server: ServerTruthHint | null | undefined,
  ): Promise<{ readonly draft: OfflineDraftRecord; readonly blocked: boolean }>;
  resolveConflict(
    localId: string,
    choice: ConflictResolutionChoice,
  ): Promise<OfflineDraftRecord | null>;
  /** Re-queue a rejected draft after the user chooses to retry. */
  retryFailed(localId: string, scope: DraftScope): Promise<OfflineDraftRecord>;
  /**
   * Claim legacy drafts that have organizationId but empty userId so they are
   * not silently invisible after user scoping lands.
   */
  claimUnscopedDrafts(scope: DraftScope): Promise<number>;
  countsByStatus(scope: DraftScope): Promise<Record<SyncStatus, number>>;
}

export function createDraftQueue(store: DraftStore = getDefaultDraftStore()): DraftQueue {
  return {
    async enqueue(input) {
      assertValidScope({ organizationId: input.organizationId, userId: input.userId });
      const now = new Date().toISOString();
      const existing = input.localId ? await store.get(input.localId) : undefined;

      if (existing && existing.organizationId !== input.organizationId) {
        throw new OfflineScopeError('Cannot reassign an offline draft to another organization.');
      }
      if (existing?.userId && existing.userId !== input.userId) {
        throw new OfflineScopeError('Cannot mutate another user\'s offline draft.');
      }

      const dedupeKey = buildDedupeKey({
        organizationId: input.organizationId,
        userId: input.userId,
        kind: input.kind,
        payload: input.payload as Record<string, unknown>,
        serverId: input.serverId ?? existing?.serverId ?? null,
      });

      if (!input.localId && !input.allowDuplicate) {
        const scoped = await store.list(input.organizationId);
        const duplicate = findDuplicatePending(
          scoped.filter((row) => row.userId === input.userId),
          dedupeKey,
        );
        // Double-tap while an identical draft is in-flight: keep the syncing row.
        if (duplicate && shouldBlockDuplicateWhileSyncing(duplicate, dedupeKey)) {
          return duplicate as OfflineDraftRecord<typeof input.payload>;
        }
        if (duplicate) {
          // Collapse double-submit into the existing pending row (no silent loss).
          const collapsed: OfflineDraftRecord = {
            ...duplicate,
            payload: { ...input.payload },
            updatedAt: now,
            syncStatus:
              duplicate.syncStatus === 'conflict' || duplicate.syncStatus === 'rejected'
                ? duplicate.syncStatus
                : 'queued',
            dedupeKey,
            userId: input.userId,
            conflictReason:
              duplicate.syncStatus === 'conflict' || duplicate.syncStatus === 'rejected'
                ? duplicate.conflictReason
                : null,
          };
          await store.put(collapsed);
          return collapsed as OfflineDraftRecord<typeof input.payload>;
        }
      }

      if (existing?.syncStatus === 'conflict' || existing?.syncStatus === 'rejected') {
        // Preserve failure state until the user resolves / retries — do not silently re-queue.
        const preserved: OfflineDraftRecord = {
          ...existing,
          payload: { ...input.payload },
          updatedAt: now,
          userId: existing.userId || input.userId,
          dedupeKey,
        };
        await store.put(preserved);
        return preserved as OfflineDraftRecord<typeof input.payload>;
      }

      const record: OfflineDraftRecord = {
        localId: existing?.localId ?? input.localId ?? newLocalId(),
        organizationId: input.organizationId,
        userId: input.userId,
        kind: input.kind,
        payload: { ...input.payload },
        updatedAt: now,
        syncStatus: 'queued',
        serverId: input.serverId ?? existing?.serverId ?? null,
        serverUpdatedAt: input.serverUpdatedAt ?? existing?.serverUpdatedAt ?? null,
        conflictReason: null,
        serverSnapshot: null,
        dedupeKey,
      };
      await store.put(record);
      return record as OfflineDraftRecord<typeof input.payload>;
    },

    async list(filter = {}) {
      const pendingOnly = filter.pendingOnly ?? true;
      let rows = await store.list(filter.organizationId);
      if (filter.userId) {
        rows = rows.filter((r) => r.userId === filter.userId);
      }
      if (filter.kind) {
        rows = rows.filter((r) => r.kind === filter.kind);
      }
      if (filter.syncStatus) {
        const allowed = new Set(
          Array.isArray(filter.syncStatus) ? filter.syncStatus : [filter.syncStatus],
        );
        rows = rows.filter((r) => allowed.has(r.syncStatus));
      } else if (pendingOnly) {
        const pending = new Set(PENDING_SYNC_STATUSES);
        rows = rows.filter((r) => pending.has(r.syncStatus));
      }
      return rows;
    },

    async get(localId) {
      return store.get(localId);
    },

    async updateUnsynced(localId, scope, payload) {
      assertValidScope(scope);
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      if (existing.organizationId !== scope.organizationId || existing.userId !== scope.userId) {
        throw new OfflineScopeError('Cannot edit an offline draft outside the active scope.');
      }
      if (existing.syncStatus === 'synced' || existing.syncStatus === 'syncing') {
        throw new OfflineConflictError('Only unsynced local drafts can be edited.');
      }
      const dedupeKey = buildDedupeKey({
        organizationId: existing.organizationId,
        userId: existing.userId,
        kind: existing.kind,
        payload,
        serverId: existing.serverId,
      });
      const updated: OfflineDraftRecord = {
        ...existing,
        payload: { ...payload },
        updatedAt: new Date().toISOString(),
        dedupeKey,
        // Keep conflict/rejected until explicit retry; still allow payload edits.
        syncStatus:
          existing.syncStatus === 'conflict' || existing.syncStatus === 'rejected'
            ? existing.syncStatus
            : 'queued',
      };
      await store.put(updated);
      return updated;
    },

    async deleteUnsynced(localId, scope) {
      assertValidScope(scope);
      const existing = await store.get(localId);
      if (!existing) return;
      if (existing.organizationId !== scope.organizationId || existing.userId !== scope.userId) {
        throw new OfflineScopeError('Cannot delete an offline draft outside the active scope.');
      }
      if (existing.syncStatus === 'syncing') {
        throw new OfflineConflictError('Cannot delete a draft while sync is in progress.');
      }
      // Synced local copies may be discarded; server truth remains.
      await store.delete(localId);
    },

    async markSynced(localId, server) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      if (existing.syncStatus === 'conflict' || existing.syncStatus === 'rejected') {
        throw new OfflineConflictError(
          'Cannot mark a conflicted/rejected draft as synced without resolving first.',
        );
      }
      const updated: OfflineDraftRecord = {
        ...existing,
        syncStatus: 'synced',
        serverId: server.serverId,
        serverUpdatedAt: server.serverUpdatedAt,
        conflictReason: null,
        serverSnapshot: null,
        updatedAt: new Date().toISOString(),
      };
      await store.put(updated);
      return updated;
    },

    async markConflict(localId, reason, server) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      const updated: OfflineDraftRecord = {
        ...existing,
        syncStatus: 'conflict',
        conflictReason: reason,
        serverId: server?.serverId ?? existing.serverId,
        serverUpdatedAt: server?.serverUpdatedAt ?? existing.serverUpdatedAt,
        serverSnapshot: server?.snapshot ?? existing.serverSnapshot,
        updatedAt: new Date().toISOString(),
      };
      await store.put(updated);
      return updated;
    },

    async markRejected(localId, reason) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      const updated: OfflineDraftRecord = {
        ...existing,
        syncStatus: 'rejected',
        conflictReason: reason,
        updatedAt: new Date().toISOString(),
      };
      await store.put(updated);
      return updated;
    },

    async prepareForSync(localId, server) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      if (existing.syncStatus === 'conflict' || existing.syncStatus === 'rejected') {
        return { draft: existing, blocked: true };
      }
      if (detectConflict(existing, server)) {
        const conflicted = await this.markConflict(
          localId,
          'Server record changed since this draft was created.',
          server,
        );
        return { draft: conflicted, blocked: true };
      }
      const syncing: OfflineDraftRecord = {
        ...existing,
        syncStatus: 'syncing',
        updatedAt: new Date().toISOString(),
      };
      await store.put(syncing);
      return { draft: syncing, blocked: false };
    },

    async resolveConflict(localId, choice) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      const resolved = applyConflictResolution(existing, choice);
      if (resolved === null) {
        await store.delete(localId);
        return null;
      }
      await store.put(resolved);
      return resolved;
    },

    async retryFailed(localId, scope) {
      assertValidScope(scope);
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      if (existing.organizationId !== scope.organizationId || existing.userId !== scope.userId) {
        throw new OfflineScopeError('Cannot retry an offline draft outside the active scope.');
      }
      if (existing.syncStatus !== 'rejected' && existing.syncStatus !== 'conflict') {
        throw new OfflineConflictError('Only rejected or conflicted drafts can be retried.');
      }
      // Conflict retry keeps local as a fresh create-candidate (same as keep_local).
      const retried: OfflineDraftRecord = {
        ...existing,
        syncStatus: 'queued',
        conflictReason: null,
        serverSnapshot: null,
        serverId: existing.syncStatus === 'conflict' ? null : existing.serverId,
        serverUpdatedAt: existing.syncStatus === 'conflict' ? null : existing.serverUpdatedAt,
        updatedAt: new Date().toISOString(),
      };
      await store.put(retried);
      return retried;
    },

    async claimUnscopedDrafts(scope) {
      assertValidScope(scope);
      const rows = await store.list(scope.organizationId);
      let claimed = 0;
      for (const row of rows) {
        if (!isUnscopedDraft(row, scope.organizationId)) continue;
        await store.put({
          ...row,
          userId: scope.userId,
          updatedAt: new Date().toISOString(),
        });
        claimed += 1;
      }
      return claimed;
    },

    async countsByStatus(scope) {
      assertValidScope(scope);
      const rows = await store.list(scope.organizationId);
      const counts: Record<SyncStatus, number> = {
        draft: 0,
        queued: 0,
        syncing: 0,
        synced: 0,
        conflict: 0,
        rejected: 0,
      };
      for (const row of rows) {
        if (row.userId !== scope.userId) continue;
        counts[row.syncStatus] += 1;
      }
      return counts;
    },
  };
}

/** Shared browser queue singleton. */
let defaultQueue: DraftQueue | null = null;

export function getDraftQueue(): DraftQueue {
  if (!defaultQueue) {
    defaultQueue = createDraftQueue();
  }
  return defaultQueue;
}

export function resetDraftQueueForTests(): void {
  defaultQueue = null;
}
