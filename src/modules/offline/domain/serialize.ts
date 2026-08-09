import { DRAFT_KINDS, SYNC_STATUSES, type OfflineDraftRecord, type QueuedAction } from './types';

export class OfflineSerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineSerializeError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDraftKind(value: unknown): value is QueuedAction['kind'] {
  return typeof value === 'string' && (DRAFT_KINDS as readonly string[]).includes(value);
}

function isSyncStatus(value: unknown): value is QueuedAction['syncStatus'] {
  return typeof value === 'string' && (SYNC_STATUSES as readonly string[]).includes(value);
}

/** Stable JSON shape for the sync queue wire / persistence layer. */
export function toQueuedAction(record: OfflineDraftRecord): QueuedAction {
  return {
    localId: record.localId,
    organizationId: record.organizationId,
    kind: record.kind,
    payload: { ...record.payload },
    updatedAt: record.updatedAt,
    syncStatus: record.syncStatus,
    serverId: record.serverId,
    serverUpdatedAt: record.serverUpdatedAt,
  };
}

export function serializeQueuedAction(record: OfflineDraftRecord | QueuedAction): string {
  const action = 'payload' in record && 'localId' in record ? toQueuedAction(record as OfflineDraftRecord) : record;
  return JSON.stringify(action);
}

export function parseQueuedAction(raw: string): QueuedAction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new OfflineSerializeError('Queued action JSON is invalid.');
  }

  if (!isPlainObject(parsed)) {
    throw new OfflineSerializeError('Queued action must be an object.');
  }

  const {
    localId,
    organizationId,
    kind,
    payload,
    updatedAt,
    syncStatus,
    serverId,
    serverUpdatedAt,
  } = parsed;

  if (typeof localId !== 'string' || localId.length === 0) {
    throw new OfflineSerializeError('Queued action localId is required.');
  }
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new OfflineSerializeError('Queued action organizationId is required.');
  }
  if (!isDraftKind(kind)) {
    throw new OfflineSerializeError(`Unknown draft kind: ${String(kind)}`);
  }
  if (!isPlainObject(payload)) {
    throw new OfflineSerializeError('Queued action payload must be an object.');
  }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
    throw new OfflineSerializeError('Queued action updatedAt must be an ISO timestamp.');
  }
  if (!isSyncStatus(syncStatus)) {
    throw new OfflineSerializeError(`Unknown syncStatus: ${String(syncStatus)}`);
  }
  if (serverId !== null && typeof serverId !== 'string') {
    throw new OfflineSerializeError('Queued action serverId must be string or null.');
  }
  if (serverUpdatedAt !== null && typeof serverUpdatedAt !== 'string') {
    throw new OfflineSerializeError('Queued action serverUpdatedAt must be string or null.');
  }

  return {
    localId,
    organizationId,
    kind,
    payload,
    updatedAt,
    syncStatus,
    serverId: serverId ?? null,
    serverUpdatedAt: serverUpdatedAt ?? null,
  };
}

/**
 * Conflict-safe merge rule for queue replay:
 * if an existing local record is already in `conflict`, never replace it with a
 * freshly deserialized "queued" action that claims the same localId.
 */
export function mergeDeserializedWithExisting(
  existing: OfflineDraftRecord | undefined,
  incoming: QueuedAction,
): QueuedAction {
  if (!existing) return incoming;
  if (existing.syncStatus === 'conflict') {
    return {
      ...incoming,
      syncStatus: 'conflict',
      serverId: existing.serverId,
      serverUpdatedAt: existing.serverUpdatedAt,
      // Prefer the conflicted local payload; server truth stays on the record.
      payload: { ...existing.payload },
      updatedAt: existing.updatedAt,
    };
  }
  // Prefer the newer local update clock; never invent a synced overwrite.
  if (existing.updatedAt >= incoming.updatedAt) {
    return toQueuedAction(existing);
  }
  return incoming;
}
