import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { organizations } from './tenancy';

/**
 * Electrical smart takeoff ("כתב כמויות חכם לחשמל") — migration 0205 (PREPARED, NOT APPLIED).
 *
 * Org + project on every row; composite FK targets and RLS live in the SQL migration.
 * Bytes live in organization cloud storage via evidence_items / storage_files (see takeoff_files.evidence_id).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const TAKEOFF_ANALYSIS_STATUSES = ['draft', 'processing', 'in_review', 'approved'] as const;
export const TAKEOFF_PERSISTENCE_MODES = ['persistent', 'ephemeral'] as const;
export const TAKEOFF_SOURCE_KINDS = ['pdf', 'dwg', 'dxf'] as const;
export const TAKEOFF_FILE_UPLOAD_STATES = ['pending', 'uploading', 'complete', 'failed'] as const;
export const TAKEOFF_JOB_STATUSES = ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'] as const;
export const TAKEOFF_JOB_STAGES = [
  'queued',
  'downloading',
  'detect_type',
  'sheets',
  'legend',
  'extract',
  'classify',
  'merge',
  'render',
  'upload',
  'done',
] as const;
export const TAKEOFF_RULE_SCOPES = ['default', 'organization', 'project', 'analysis'] as const;
export const TAKEOFF_SIGNATURE_KINDS = ['pdf-shape', 'dwg-block', 'legend-key'] as const;

export const takeoffAnalyses = pgTable(
  'takeoff_analyses',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<(typeof TAKEOFF_ANALYSIS_STATUSES)[number]>().notNull().default('draft'),
    plannerKey: text('planner_key').notNull().default('unknown'),
    revision: integer('revision').notNull().default(0),
    ruleSetId: uuid('rule_set_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByActorType: text('created_by_actor_type').$type<'internal' | 'external'>().notNull().default('internal'),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    vendorId: uuid('vendor_id'),
    approvedAt: ts('approved_at'),
    approvedByUserId: uuid('approved_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    currentApprovalId: uuid('current_approval_id'),
    persistenceMode: text('persistence_mode')
      .$type<(typeof TAKEOFF_PERSISTENCE_MODES)[number]>()
      .notNull()
      .default('persistent'),
    ephemeralExpiresAt: ts('ephemeral_expires_at'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_analyses_id_organization_id_project_id_uq').on(table.id, table.organizationId, table.projectId),
    index('takeoff_analyses_project_idx').on(table.organizationId, table.projectId, table.updatedAt),
    index('takeoff_analyses_ephemeral_expiry_idx').on(table.organizationId, table.ephemeralExpiresAt),
    check('takeoff_analyses_status_known', sql`${table.status} IN ('draft', 'processing', 'in_review', 'approved')`),
    check(
      'takeoff_analyses_persistence_known',
      sql`${table.persistenceMode} IN ('persistent', 'ephemeral')`,
    ),
  ],
);

export const takeoffFiles = pgTable(
  'takeoff_files',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<(typeof TAKEOFF_SOURCE_KINDS)[number]>().notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256'),
    evidenceId: uuid('evidence_id'),
    storageDocumentId: uuid('storage_document_id'),
    uploadState: text('upload_state')
      .$type<(typeof TAKEOFF_FILE_UPLOAD_STATES)[number]>()
      .notNull()
      .default('pending'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    uploadedByPrincipalId: uuid('uploaded_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_files_id_organization_id_project_id_uq').on(table.id, table.organizationId, table.projectId),
    index('takeoff_files_analysis_idx').on(table.organizationId, table.projectId, table.analysisId),
    check('takeoff_files_kind_known', sql`${table.kind} IN ('pdf', 'dwg', 'dxf')`),
    check(
      'takeoff_files_upload_state_known',
      sql`${table.uploadState} IN ('pending', 'uploading', 'complete', 'failed')`,
    ),
  ],
);

export const takeoffJobs = pgTable(
  'takeoff_jobs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    status: text('status').$type<(typeof TAKEOFF_JOB_STATUSES)[number]>().notNull().default('queued'),
    stage: text('stage').$type<(typeof TAKEOFF_JOB_STAGES)[number]>().notNull().default('queued'),
    percent: integer('percent').notNull().default(0),
    message: text('message'),
    requestJson: jsonb('request_json').$type<Record<string, unknown>>(),
    requestHash: text('request_hash'),
    tokenHash: text('token_hash'),
    tokenExpiresAt: ts('token_expires_at'),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    error: text('error'),
    workerJobId: text('worker_job_id'),
    attempts: integer('attempts').notNull().default(0),
    resultIngestedAt: ts('result_ingested_at'),
    resultStats: jsonb('result_stats').$type<Record<string, number | string | Record<string, string>>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_jobs_id_organization_id_project_id_uq').on(table.id, table.organizationId, table.projectId),
    index('takeoff_jobs_analysis_idx').on(table.organizationId, table.projectId, table.analysisId, table.createdAt),
    check(
      'takeoff_jobs_status_known',
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')`,
    ),
  ],
);

export const takeoffSheets = pgTable(
  'takeoff_sheets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    sheetKey: text('sheet_key').notNull(),
    fileId: uuid('file_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    floorLabel: text('floor_label'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_sheets_job_idx').on(table.organizationId, table.jobId),
    uniqueIndex('takeoff_sheets_job_sheet_uq').on(table.jobId, table.fileId, table.sheetKey),
  ],
);

export const takeoffDetections = pgTable(
  'takeoff_detections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    detectionKey: text('detection_key').notNull(),
    sheetKey: text('sheet_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_detections_job_idx').on(table.organizationId, table.jobId),
    uniqueIndex('takeoff_detections_job_key_uq').on(table.jobId, table.detectionKey),
  ],
);

export const takeoffEdits = pgTable(
  'takeoff_edits',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    seq: integer('seq').notNull(),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    actorType: text('actor_type').$type<'internal' | 'external'>().notNull(),
    op: jsonb('op').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_edits_analysis_seq_uq').on(table.analysisId, table.seq),
    index('takeoff_edits_analysis_idx').on(table.organizationId, table.analysisId),
  ],
);

export const takeoffAreas = pgTable(
  'takeoff_areas',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    sheetKey: text('sheet_key').notNull(),
    name: text('name').notNull(),
    polygon: jsonb('polygon').$type<number[][]>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [index('takeoff_areas_analysis_idx').on(table.organizationId, table.analysisId)],
);

export const takeoffArtifacts = pgTable(
  'takeoff_artifacts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    evidenceId: uuid('evidence_id'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_artifacts_job_idx').on(table.organizationId, table.jobId),
    uniqueIndex('takeoff_artifacts_job_name_uq').on(table.jobId, table.name),
  ],
);

export const takeoffLegendEntries = pgTable(
  'takeoff_legend_entries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    entryKey: text('entry_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('takeoff_legend_entries_job_key_uq').on(table.jobId, table.entryKey)],
);

export const takeoffLinear = pgTable(
  'takeoff_linear',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    linearKey: text('linear_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('takeoff_linear_job_key_uq').on(table.jobId, table.linearKey)],
);

export const takeoffWarnings = pgTable(
  'takeoff_warnings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    code: text('code').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [index('takeoff_warnings_job_idx').on(table.organizationId, table.jobId)],
);

export const takeoffPlannerSymbolLibrary = pgTable(
  'takeoff_planner_symbol_library',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    plannerKey: text('planner_key').notNull(),
    signatureKind: text('signature_kind').$type<(typeof TAKEOFF_SIGNATURE_KINDS)[number]>().notNull(),
    signature: text('signature').notNull(),
    template: jsonb('template').$type<Record<string, unknown>>(),
    typeKey: text('type_key').notNull(),
    label: text('label'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_planner_symbol_library_uq').on(
      table.organizationId,
      table.plannerKey,
      table.signatureKind,
      table.signature,
    ),
    index('takeoff_planner_symbol_library_planner_idx').on(table.organizationId, table.plannerKey),
    check('takeoff_planner_signature_kind_known', sql`${table.signatureKind} IN ('pdf-shape', 'dwg-block', 'legend-key')`),
  ],
);

export const takeoffCatalogTypes = pgTable(
  'takeoff_catalog_types',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    builtIn: boolean('built_in').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    nameNorm: text('name_norm').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('takeoff_catalog_types_org_key_uq').on(table.organizationId, table.key)],
);

export const takeoffRuleSets = pgTable(
  'takeoff_rule_sets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    analysisId: uuid('analysis_id'),
    name: text('name').notNull(),
    scope: text('scope').$type<(typeof TAKEOFF_RULE_SCOPES)[number]>().notNull(),
    version: integer('version').notNull().default(1),
    rules: jsonb('rules').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_rule_sets_org_idx').on(table.organizationId, table.scope),
    uniqueIndex('takeoff_rule_sets_id_organization_id_uq').on(table.id, table.organizationId),
    check('takeoff_rule_sets_scope_known', sql`${table.scope} IN ('default', 'organization', 'project', 'analysis')`),
  ],
);

export const takeoffApprovals = pgTable(
  'takeoff_approvals',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    analysisId: uuid('analysis_id').notNull(),
    boqJson: jsonb('boq_json').$type<Record<string, unknown>>().notNull(),
    detectionsHash: text('detections_hash').notNull(),
    fileVersionsJson: jsonb('file_versions_json').$type<Record<string, unknown>>().notNull(),
    ruleSetVersion: integer('rule_set_version').notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: ts('approved_at').notNull().defaultNow(),
    reopenedAt: ts('reopened_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_approvals_id_organization_id_uq').on(table.id, table.organizationId),
    index('takeoff_approvals_analysis_idx').on(table.organizationId, table.analysisId, table.approvedAt),
  ],
);