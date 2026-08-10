import type { DraftKind, OfflineDraftRecord, SyncStatus } from './types';
import { PENDING_SYNC_STATUSES } from './types';

const DEDUPE_PENDING = new Set<SyncStatus>(PENDING_SYNC_STATUSES.filter((s) => s !== 'synced'));

/**
 * Stable client fingerprint for duplicate-submit protection.
 * Same org/user/kind + normalized payload ⇒ same key.
 */
export function buildDedupeKey(input: {
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: DraftKind;
  readonly payload: Record<string, unknown>;
  readonly serverId?: string | null;
}): string {
  const normalized = normalizeForDedupe(input.payload);
  const body = JSON.stringify({
    o: input.organizationId,
    u: input.userId,
    k: input.kind,
    s: input.serverId ?? null,
    p: normalized,
  });
  return `dedupe:${fnv1aHex(body)}`;
}

export function normalizeForDedupe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeForDedupe(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalizeForDedupe(v)]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

/** Find a pending draft with the same fingerprint (double-tap / retry collapse). */
export function findDuplicatePending(
  rows: readonly OfflineDraftRecord[],
  dedupeKey: string,
  excludeLocalId?: string,
): OfflineDraftRecord | undefined {
  return rows.find(
    (row) =>
      row.dedupeKey === dedupeKey &&
      DEDUPE_PENDING.has(row.syncStatus) &&
      row.localId !== excludeLocalId,
  );
}

/**
 * While a draft is `syncing`, refuse to enqueue a duplicate fingerprint so a
 * reconnect race cannot create a second in-flight create.
 */
export function shouldBlockDuplicateWhileSyncing(
  existing: Pick<OfflineDraftRecord, 'syncStatus' | 'dedupeKey'> | undefined,
  nextDedupeKey: string,
): boolean {
  if (!existing) return false;
  return existing.syncStatus === 'syncing' && existing.dedupeKey === nextDedupeKey;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
