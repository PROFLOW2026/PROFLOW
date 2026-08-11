/**
 * Client-only offline draft model (field PWA hardening).
 *
 * Drafts live in IndexedDB / memory — no server schema. Offline mode creates
 * candidates, never authoritative issued financial documents (doc 31).
 */

export const DRAFT_KINDS = [
  'expense',
  'time_entry',
  'change_request',
  'daily_log',
  /** Punch-list field capture (create candidate). */
  'punch',
  /** Inspection field capture (create candidate). */
  'inspection',
  /** Field form draft / submission sync candidate. */
  'form_submission',
  /** Photo / document capture waiting for upload (blob stored separately). */
  'capture',
] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number];

export const SYNC_STATUSES = [
  'draft',
  'queued',
  'syncing',
  'synced',
  'conflict',
  'rejected',
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Statuses that still need attention before the local record can be discarded. */
export const PENDING_SYNC_STATUSES: readonly SyncStatus[] = [
  'draft',
  'queued',
  'syncing',
  'conflict',
  'rejected',
];

/** Statuses the field UI treats as failed / needs recovery (not auto-drained). */
export const FAILED_SYNC_STATUSES: readonly SyncStatus[] = ['conflict', 'rejected'];

export interface OfflineDraftRecord<TPayload = Record<string, unknown>> {
  readonly localId: string;
  readonly organizationId: string;
  /** Authenticated user who created/owns this local draft (tenant+user scoping). */
  readonly userId: string;
  readonly kind: DraftKind;
  readonly payload: TPayload;
  /** ISO-8601 timestamp of the last local mutation. */
  readonly updatedAt: string;
  readonly syncStatus: SyncStatus;
  /** Server primary key once known; absent for pure offline creates. */
  readonly serverId: string | null;
  /**
   * Last server `updatedAt` observed when this draft was loaded or last synced.
   * Used for conflict detection — never overwritten without an explicit choice.
   */
  readonly serverUpdatedAt: string | null;
  readonly conflictReason: string | null;
  /** Optional opaque server snapshot captured at conflict time for UI review. */
  readonly serverSnapshot: Record<string, unknown> | null;
  /**
   * Stable fingerprint for client-side duplicate suppression (double-submit).
   * Server-side idempotency still uses the offline marker on text fields.
   */
  readonly dedupeKey: string | null;
}

export interface QueuedAction {
  readonly localId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: DraftKind;
  readonly payload: Record<string, unknown>;
  readonly updatedAt: string;
  readonly syncStatus: SyncStatus;
  readonly serverId: string | null;
  readonly serverUpdatedAt: string | null;
  readonly dedupeKey: string | null;
}

export interface EnqueueDraftInput<TPayload = Record<string, unknown>> {
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: DraftKind;
  readonly payload: TPayload;
  /** Re-enqueue / update an existing local draft. */
  readonly localId?: string;
  readonly serverId?: string | null;
  readonly serverUpdatedAt?: string | null;
  /** When true, skip fingerprint duplicate collapse (explicit new draft). */
  readonly allowDuplicate?: boolean;
}

export interface DraftScope {
  readonly organizationId: string;
  readonly userId: string;
}

export interface ServerTruthHint {
  readonly serverId: string;
  readonly serverUpdatedAt: string;
  readonly snapshot?: Record<string, unknown> | null;
}

export type ConflictResolutionChoice =
  /** Keep local as a new candidate; clear server linkage so sync creates anew. */
  | 'keep_local_as_candidate'
  /** Discard the local draft; server truth remains untouched. */
  | 'discard_local';
