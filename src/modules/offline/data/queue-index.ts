/**
 * Lightweight localStorage mirror of pending draft metadata.
 * Used for quick banner counts when IndexedDB is slow/unavailable.
 * Never authoritative - IndexedDB remains source of truth for payloads/blobs.
 */

import type { DraftKind, OfflineDraftRecord, SyncStatus } from '../domain/types';
import { FAILED_SYNC_STATUSES, PENDING_SYNC_STATUSES } from '../domain/types';

const STORAGE_KEY = 'projectflow.offline.queue-index.v2';

export interface QueueIndexEntry {
  readonly localId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: DraftKind;
  readonly syncStatus: SyncStatus;
  readonly updatedAt: string;
}

export interface QueueIndexSnapshot {
  readonly version: 2;
  readonly updatedAt: string;
  readonly entries: readonly QueueIndexEntry[];
}

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function readQueueIndex(): QueueIndexSnapshot | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueueIndexSnapshot;
    if (parsed?.version !== 2 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeQueueIndex(entries: readonly QueueIndexEntry[]): void {
  if (!canUseLocalStorage()) return;
  const snapshot: QueueIndexSnapshot = {
    version: 2,
    updatedAt: new Date().toISOString(),
    entries: [...entries],
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / private mode - ignore; IndexedDB still holds drafts.
  }
}

export function draftToQueueIndexEntry(draft: OfflineDraftRecord): QueueIndexEntry {
  return {
    localId: draft.localId,
    organizationId: draft.organizationId,
    userId: draft.userId,
    kind: draft.kind,
    syncStatus: draft.syncStatus,
    updatedAt: draft.updatedAt,
  };
}

export function mirrorDraftsToLocalStorage(drafts: readonly OfflineDraftRecord[]): void {
  const pending = new Set(PENDING_SYNC_STATUSES);
  writeQueueIndex(
    drafts
      .filter((d) => pending.has(d.syncStatus))
      .map(draftToQueueIndexEntry),
  );
}

export function countPendingInQueueIndex(scope?: {
  readonly organizationId?: string;
  readonly userId?: string;
}): number {
  const snapshot = readQueueIndex();
  if (!snapshot) return 0;
  const pending = new Set(PENDING_SYNC_STATUSES);
  return snapshot.entries.filter(
    (e) =>
      pending.has(e.syncStatus) &&
      (!scope?.organizationId || e.organizationId === scope.organizationId) &&
      (!scope?.userId || e.userId === scope.userId),
  ).length;
}

export function countFailedInQueueIndex(scope?: {
  readonly organizationId?: string;
  readonly userId?: string;
}): number {
  const snapshot = readQueueIndex();
  if (!snapshot) return 0;
  const failed = new Set(FAILED_SYNC_STATUSES);
  return snapshot.entries.filter(
    (e) =>
      failed.has(e.syncStatus) &&
      (!scope?.organizationId || e.organizationId === scope.organizationId) &&
      (!scope?.userId || e.userId === scope.userId),
  ).length;
}

/** Test / logout helper. */
export function clearQueueIndex(): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Also clear legacy v1 key so counts cannot read stale unscoped rows.
    localStorage.removeItem('projectflow.offline.queue-index.v1');
  } catch {
    // ignore
  }
}
