import type { SyncStatus } from './types';

/**
 * User-facing sync groups. Internal statuses stay draft/queued/syncing/synced/
 * conflict/rejected; the field UI must not pretend a queued row is posted.
 */
export const TRUTHFUL_SYNC_LABELS = [
  'saved_on_device',
  'waiting_to_sync',
  'synced',
  'failed_retry',
] as const;

export type TruthfulSyncLabel = (typeof TRUTHFUL_SYNC_LABELS)[number];

export function truthfulSyncLabel(status: SyncStatus): TruthfulSyncLabel {
  switch (status) {
    case 'draft':
      return 'saved_on_device';
    case 'queued':
    case 'syncing':
      return 'waiting_to_sync';
    case 'synced':
      return 'synced';
    case 'conflict':
    case 'rejected':
      return 'failed_retry';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
