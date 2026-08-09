import type {
  ConflictResolutionChoice,
  OfflineDraftRecord,
  ServerTruthHint,
  SyncStatus,
} from './types';

export class OfflineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineConflictError';
  }
}

/**
 * Server truth must never be silently overwritten by an offline draft.
 * Callers must surface conflict status and require an explicit resolution.
 */
export function assertNeverSilentOverwrite(intent: {
  readonly wouldOverwriteServer: boolean;
  readonly userConfirmed: boolean;
}): void {
  if (intent.wouldOverwriteServer && !intent.userConfirmed) {
    throw new OfflineConflictError(
      'Offline sync refuses to overwrite server truth without an explicit user choice.',
    );
  }
}

/**
 * A conflict exists when the draft is linked to a server row and the server
 * version advanced beyond the version the draft last observed.
 */
export function detectConflict(
  draft: Pick<OfflineDraftRecord, 'serverId' | 'serverUpdatedAt' | 'syncStatus'>,
  server: ServerTruthHint | null | undefined,
): boolean {
  if (!draft.serverId || !server) return false;
  if (draft.serverId !== server.serverId) return false;
  if (!draft.serverUpdatedAt) {
    // Linked to a server row but we never captured a baseline — treat as conflict
    // so we do not push blindly over unknown server state.
    return true;
  }
  return server.serverUpdatedAt > draft.serverUpdatedAt;
}

export function shouldBlockAutoSync(
  draft: Pick<OfflineDraftRecord, 'syncStatus' | 'serverId' | 'serverUpdatedAt'>,
  server: ServerTruthHint | null | undefined,
): boolean {
  if (draft.syncStatus === 'conflict' || draft.syncStatus === 'rejected') return true;
  return detectConflict(draft, server);
}

/**
 * Pure transition helper — does not mutate storage.
 * Resolving a conflict never writes to the server; it only adjusts local state.
 */
export function applyConflictResolution(
  draft: OfflineDraftRecord,
  choice: ConflictResolutionChoice,
  nowIso: string = new Date().toISOString(),
): OfflineDraftRecord | null {
  if (draft.syncStatus !== 'conflict') {
    throw new OfflineConflictError('Only conflict-status drafts can be resolved.');
  }

  switch (choice) {
    case 'discard_local':
      return null;
    case 'keep_local_as_candidate':
      return {
        ...draft,
        serverId: null,
        serverUpdatedAt: null,
        serverSnapshot: null,
        conflictReason: null,
        syncStatus: 'queued',
        updatedAt: nowIso,
      };
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}

/** Statuses the UI should highlight as needing user attention. */
export function isConflictStatus(status: SyncStatus): boolean {
  return status === 'conflict';
}

/**
 * Building a sync payload that would mutate an existing server row requires
 * either no conflict or an explicit confirmation — never implicit last-write-wins.
 */
export function canPrepareServerMutation(
  draft: Pick<OfflineDraftRecord, 'serverId' | 'serverUpdatedAt' | 'syncStatus'>,
  server: ServerTruthHint | null | undefined,
  options: { readonly userConfirmedOverwrite: boolean } = {
    userConfirmedOverwrite: false,
  },
): boolean {
  if (draft.syncStatus === 'conflict' || draft.syncStatus === 'rejected') {
    return options.userConfirmedOverwrite;
  }
  if (!draft.serverId) {
    // Create-candidate — safe to enqueue; server still validates.
    return true;
  }
  if (detectConflict(draft, server)) {
    return options.userConfirmedOverwrite;
  }
  return true;
}
