import {
  applyConflictResolution,
  detectConflict,
  OfflineConflictError,
} from '../domain/conflict';
import type {
  ConflictResolutionChoice,
  DraftKind,
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
  markSynced(
    localId: string,
    server: { readonly serverId: string; readonly serverUpdatedAt: string },
  ): Promise<OfflineDraftRecord>;
  markConflict(
    localId: string,
    reason: string,
    server?: ServerTruthHint | null,
  ): Promise<OfflineDraftRecord>;
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
  countsByStatus(organizationId: string): Promise<Record<SyncStatus, number>>;
}

export function createDraftQueue(store: DraftStore = getDefaultDraftStore()): DraftQueue {
  return {
    async enqueue(input) {
      const now = new Date().toISOString();
      const existing = input.localId ? await store.get(input.localId) : undefined;

      if (existing?.syncStatus === 'conflict') {
        // Preserve conflict until the user resolves — do not silently re-queue over it.
        const preserved: OfflineDraftRecord = {
          ...existing,
          payload: { ...input.payload },
          updatedAt: now,
        };
        await store.put(preserved);
        return preserved as OfflineDraftRecord<typeof input.payload>;
      }

      const record: OfflineDraftRecord = {
        localId: existing?.localId ?? input.localId ?? newLocalId(),
        organizationId: input.organizationId,
        kind: input.kind,
        payload: { ...input.payload },
        updatedAt: now,
        syncStatus: 'queued',
        serverId: input.serverId ?? existing?.serverId ?? null,
        serverUpdatedAt: input.serverUpdatedAt ?? existing?.serverUpdatedAt ?? null,
        conflictReason: null,
        serverSnapshot: null,
      };
      await store.put(record);
      return record as OfflineDraftRecord<typeof input.payload>;
    },

    async list(filter = {}) {
      const pendingOnly = filter.pendingOnly ?? true;
      let rows = await store.list(filter.organizationId);
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

    async markSynced(localId, server) {
      const existing = await store.get(localId);
      if (!existing) {
        throw new OfflineConflictError(`Draft ${localId} not found.`);
      }
      if (existing.syncStatus === 'conflict') {
        throw new OfflineConflictError(
          'Cannot mark a conflicted draft as synced without resolving the conflict first.',
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

    async countsByStatus(organizationId) {
      const rows = await store.list(organizationId);
      const counts: Record<SyncStatus, number> = {
        draft: 0,
        queued: 0,
        syncing: 0,
        synced: 0,
        conflict: 0,
        rejected: 0,
      };
      for (const row of rows) {
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
