/**
 * Offline / PWA foundations (Wave 4).
 *
 * Client-side only: IndexedDB draft store + blob attachments + queued sync.
 * Service worker caches installable shell assets only (production).
 * No Drizzle tables. No push notifications.
 */

export type {
  ConflictResolutionChoice,
  DraftKind,
  EnqueueDraftInput,
  OfflineDraftRecord,
  QueuedAction,
  ServerTruthHint,
  SyncStatus,
} from './domain/types';
export {
  DRAFT_KINDS,
  PENDING_SYNC_STATUSES,
  SYNC_STATUSES,
} from './domain/types';

export {
  applyConflictResolution,
  assertNeverSilentOverwrite,
  canPrepareServerMutation,
  detectConflict,
  isConflictStatus,
  OfflineConflictError,
  shouldBlockAutoSync,
} from './domain/conflict';

export {
  assertCaptureFileAllowed,
  buildCaptureEnqueueInput,
  OfflineCaptureError,
  type CaptureDraftPayload,
  type CaptureFileMeta,
} from './domain/capture';

export {
  mergeDeserializedWithExisting,
  OfflineSerializeError,
  parseQueuedAction,
  serializeQueuedAction,
  toQueuedAction,
} from './domain/serialize';

export {
  isShellAssetUrl,
  SHELL_CACHE_NAME,
  SHELL_PRECACHE_URLS,
  shouldServeOfflineFallback,
  shouldUseCacheFirst,
} from './domain/sw-policy';

export {
  createDraftQueue,
  getDraftQueue,
  resetDraftQueueForTests,
  type DraftQueue,
  type ListDraftsFilter,
} from './data/draft-queue';

export {
  createIndexedDbDraftStore,
  createMemoryDraftStore,
  getDefaultDraftStore,
  resetDefaultDraftStoreForTests,
  type DraftStore,
} from './data/draft-store';

export {
  createAttachmentLocalId,
  createIndexedDbAttachmentStore,
  createMemoryAttachmentStore,
  getDefaultAttachmentStore,
  resetDefaultAttachmentStoreForTests,
  type AttachmentStore,
  type OfflineAttachmentRecord,
} from './data/attachment-store';

export {
  clearQueueIndex,
  countPendingInQueueIndex,
  mirrorDraftsToLocalStorage,
  readQueueIndex,
  writeQueueIndex,
  type QueueIndexEntry,
  type QueueIndexSnapshot,
} from './data/queue-index';

export {
  createNoopSyncTransport,
  isSyncableDraft,
  OfflineSyncNotWiredError,
  runQueuedSync,
  startReconnectSync,
  type OfflineSyncTransport,
  type ReconnectSyncController,
  type SyncItemResult,
  type SyncOutcomeStatus,
  type SyncRunResult,
} from './data/sync-runner';

export { enqueueCaptureDraft, createOfflinePersistence } from './data/enqueue-capture';

export { enqueueProductDraft } from './data/enqueue-product-draft';
export { isBrowserOnline } from './data/browser-online';
export {
  appendOfflineMarker,
  likePatternForOfflineMarker,
  offlineMarker,
} from './domain/offline-marker';

export {
  expensePayloadFromFormData,
  timeEntryPayloadFromFormData,
  changeRequestPayloadFromFormData,
  dailyLogPayloadFromFormData,
  payloadBuilderForKind,
  type ExpenseDraftPayload,
  type TimeEntryDraftPayload,
  type ChangeRequestDraftPayload,
  type DailyLogDraftPayload,
} from './domain/payloads';
