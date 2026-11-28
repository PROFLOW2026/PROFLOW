import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { organizations } from './tenancy';

/**
 * External professional tools. No project_id.
 * Prepared in migration 0217. Do not apply without a separate Owner SQL approval.
 * Composite foreign keys, RLS, and the scope-function replace live in the SQL file.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const externalToolSessions = pgTable(
  'external_tool_sessions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'restrict' }),
    actorKind: text('actor_kind').notNull(),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('uploading'),
    expiresAt: ts('expires_at').notNull(),
    uploadWindowEndsAt: ts('upload_window_ends_at').notNull(),
    workerLeaseUntil: ts('worker_lease_until'),
    lastHeartbeatAt: ts('last_heartbeat_at'),
    workerInstanceId: text('worker_instance_id'),
    sourceTokenHash: text('source_token_hash'),
    resultTokenHash: text('result_token_hash'),
    progressTokenHash: text('progress_token_hash'),
    terminalTokenHash: text('terminal_token_hash'),
    revision: integer('revision').notNull().default(1),
    stage: text('stage'),
    percent: integer('percent'),
    message: text('message'),
    reviewedAt: ts('reviewed_at'),
    analysisFinishedAt: ts('analysis_finished_at'),
    closedAt: ts('closed_at'),
    resultSha256: text('result_sha256'),
    resultStoredAt: ts('result_stored_at'),
    terminalReceivedAt: ts('terminal_received_at'),
    terminalOutcome: text('terminal_outcome'),
    workerJobId: text('worker_job_id'),
    analyzeRequestId: text('analyze_request_id'),
    purgeAttempts: integer('purge_attempts').notNull().default(0),
    purgeError: text('purge_error'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('external_tool_sessions_org_expiry_idx').on(table.organizationId, table.expiresAt),
    index('external_tool_sessions_lease_idx').on(table.status, table.workerLeaseUntil),
    check('external_tool_sessions_actor_known', sql`${table.actorKind} IN ('member', 'contractor')`),
  ],
);

export const externalToolFiles = pgTable(
  'external_tool_files',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => externalToolSessions.id, { onDelete: 'restrict' }),
    logicalId: uuid('logical_id').notNull(),
    relativePath: text('relative_path').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    role: text('role').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256'),
    uploadState: text('upload_state').notNull(),
    uploadUrlIssuedAt: ts('upload_url_issued_at'),
    partSizeBytes: integer('part_size_bytes').notNull().default(4194304),
    partCount: integer('part_count'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_tool_files_session_logical_uq').on(table.sessionId, table.logicalId),
    uniqueIndex('external_tool_files_session_idem_uq').on(table.sessionId, table.idempotencyKey),
  ],
);

export const externalToolParts = pgTable(
  'external_tool_parts',
  {
    id: primaryId(),
    sessionId: uuid('session_id').notNull(),
    logicalId: uuid('logical_id').notNull(),
    partIndex: integer('part_index').notNull(),
    offsetBytes: bigint('offset_bytes', { mode: 'number' }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadKey: text('upload_key').notNull(),
    lockedKey: text('locked_key'),
    sha256: text('sha256'),
    state: text('state').notNull(),
  },
  (table) => [
    uniqueIndex('external_tool_parts_slot_uq').on(table.sessionId, table.logicalId, table.partIndex),
    uniqueIndex('external_tool_parts_offset_uq').on(table.sessionId, table.logicalId, table.offsetBytes),
  ],
);

export const externalToolXrefs = pgTable(
  'external_tool_xrefs',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => externalToolSessions.id, { onDelete: 'restrict' }),
    hostLogicalId: uuid('host_logical_id').notNull(),
    parentLogicalId: uuid('parent_logical_id').notNull(),
    blockName: text('block_name').notNull(),
    savedPath: text('saved_path').notNull().default(''),
    resolvedLogicalId: uuid('resolved_logical_id'),
    wasmDocId: text('wasm_doc_id'),
    displayState: text('display_state').notNull(),
  },
  (table) => [
    uniqueIndex('external_tool_xrefs_triple_uq').on(
      table.sessionId,
      table.parentLogicalId,
      table.blockName,
      table.savedPath,
    ),
  ],
);

export const externalToolEdits = pgTable('external_tool_edits', {
  sessionId: uuid('session_id')
    .notNull()
    .references(() => externalToolSessions.id, { onDelete: 'restrict' }),
  seq: integer('seq').notNull(),
  op: jsonb('op').notNull(),
  revisionAfter: integer('revision_after').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const externalToolObjects = pgTable(
  'external_tool_objects',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').references(() => externalToolSessions.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull(),
    kind: text('kind').notNull(),
    issuedAt: ts('issued_at').notNull(),
    deleteNotBefore: ts('delete_not_before').notNull(),
    deletedAt: ts('deleted_at'),
    lastError: text('last_error'),
  },
  (table) => [uniqueIndex('external_tool_objects_key_uq').on(table.storageKey)],
);

export const externalToolStreams = pgTable('external_tool_streams', {
  sessionId: uuid('session_id')
    .notNull()
    .references(() => externalToolSessions.id, { onDelete: 'restrict' }),
  streamId: text('stream_id').notNull(),
  leaseUntil: ts('lease_until').notNull(),
  partIndex: integer('part_index').notNull(),
});
