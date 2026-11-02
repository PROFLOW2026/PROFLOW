import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { organizations } from './tenancy';

/**
 * Infrastructure mapping ("זיהוי תשתיות") - migration 0195 (PREPARED, NOT APPLIED).
 *
 * Reuses `project_locations` (hierarchy), `evidence_items` (photo index row; bytes live only in the
 * organization's own cloud storage), `tasks` (optional link) and `organization_storage_connections`.
 * These tables only carry management / search / permission metadata and file references.
 * Composite foreign keys, triggers and policies are declared in the SQL migration; they are
 * intentionally not repeated here (queries never need the relation graph). The unique indexes that
 * those keys point at ARE declared here (and `evidence_items_id_organization_id_project_id_uq` next to
 * `evidenceItems`), so the schema and the migration describe the same index set:
 *   evidence (id, organization_id, project_id)            <- captures / versions / comparisons
 *   infra_captures (id, organization_id, project_id)      <- versions / comparisons
 *   infra_capture_versions (id, capture_id, org, project) <- markings
 * `tasks` is validated by trigger app.infra_task_link_guard (tasks.project_id is nullable and movable).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const INFRA_TYPES = ['electrical', 'plumbing', 'hvac', 'comms', 'gas', 'fire', 'drywall', 'other'] as const;
export const INFRA_CAPTURE_ROLES = ['documentation', 'after_closure', 'reference'] as const;
export const INFRA_CAPTURE_SOURCES = ['camera', 'gallery', 'storage'] as const;
export const INFRA_MARKING_KINDS = ['point', 'arrow', 'line', 'rect', 'ellipse', 'freehand', 'text'] as const;
export const INFRA_COMPARISON_MODES = ['two_photos', 'live'] as const;
export const INFRA_ALIGNMENT_KINDS = ['similarity', 'perspective'] as const;
export const INFRA_FOLDER_ORIGINS = ['auto', 'linked_existing'] as const;
export const INFRA_FOLDER_STATUSES = ['pending', 'ready', 'error'] as const;

export const infraFolderMappings = pgTable(
  'infra_folder_mappings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    /** NULL = the project's infrastructure root folder. */
    locationId: uuid('location_id'),
    externalFolderId: text('external_folder_id').notNull(),
    externalParentId: text('external_parent_id'),
    displayName: text('display_name').notNull(),
    origin: text('origin').$type<(typeof INFRA_FOLDER_ORIGINS)[number]>().notNull().default('auto'),
    status: text('status').$type<(typeof INFRA_FOLDER_STATUSES)[number]>().notNull().default('ready'),
    lastError: text('last_error'),
    lastVerifiedAt: ts('last_verified_at'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('infra_folder_mappings_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('infra_folder_mappings_folder_uq').on(table.organizationId, table.connectionId, table.externalFolderId),
    index('infra_folder_mappings_project_idx').on(table.organizationId, table.projectId, table.status),
    check('infra_folder_mappings_origin_known', sql`${table.origin} IN ('auto', 'linked_existing')`),
    check('infra_folder_mappings_status_known', sql`${table.status} IN ('pending', 'ready', 'error')`),
  ],
);

export const infraCaptures = pgTable(
  'infra_captures',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    locationId: uuid('location_id').notNull(),
    /** Optional level the capture belongs to (0196); null = derived from the location tree. */
    levelId: uuid('level_id'),
    evidenceId: uuid('evidence_id').notNull(),
    taskId: uuid('task_id'),
    clientCaptureId: uuid('client_capture_id'),
    role: text('role').$type<(typeof INFRA_CAPTURE_ROLES)[number]>().notNull().default('documentation'),
    source: text('source').$type<(typeof INFRA_CAPTURE_SOURCES)[number]>().notNull().default('camera'),
    description: text('description'),
    room: text('room'),
    wall: text('wall'),
    infraType: text('infra_type').$type<(typeof INFRA_TYPES)[number]>(),
    dimensions: text('dimensions'),
    note: text('note'),
    markingVersion: integer('marking_version').notNull().default(0),
    capturedAt: ts('captured_at').notNull().defaultNow(),
    createdByActorType: text('created_by_actor_type').$type<'internal' | 'external'>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    vendorId: uuid('vendor_id'),
    removedAt: ts('removed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('infra_captures_id_organization_id_project_id_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('infra_captures_evidence_uq').on(table.evidenceId),
    index('infra_captures_location_idx').on(table.organizationId, table.projectId, table.locationId, table.capturedAt),
    index('infra_captures_project_idx').on(table.organizationId, table.projectId, table.capturedAt),
    check('infra_captures_role_known', sql`${table.role} IN ('documentation', 'after_closure', 'reference')`),
    check('infra_captures_source_known', sql`${table.source} IN ('camera', 'gallery', 'storage')`),
  ],
);

export const infraCaptureVersions = pgTable(
  'infra_capture_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    captureId: uuid('capture_id').notNull(),
    version: integer('version').notNull(),
    annotatedEvidenceId: uuid('annotated_evidence_id').notNull(),
    markingCount: integer('marking_count').notNull().default(0),
    createdByActorType: text('created_by_actor_type').$type<'internal' | 'external'>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('infra_capture_versions_id_capture_org_project_uq').on(
      table.id,
      table.captureId,
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex('infra_capture_versions_capture_version_uq').on(table.captureId, table.version),
    uniqueIndex('infra_capture_versions_evidence_uq').on(table.annotatedEvidenceId),
  ],
);

export const infraMarkings = pgTable(
  'infra_markings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    captureId: uuid('capture_id').notNull(),
    versionId: uuid('version_id').notNull(),
    kind: text('kind').$type<(typeof INFRA_MARKING_KINDS)[number]>().notNull(),
    /** Normalised (0..1) image coordinates, e.g. `{ "points": [[0.2, 0.3], [0.6, 0.3]] }`. */
    geometry: jsonb('geometry').$type<Record<string, unknown>>().notNull(),
    label: text('label'),
    infraType: text('infra_type').$type<(typeof INFRA_TYPES)[number]>(),
    color: text('color').notNull().default('#ef4444'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('infra_markings_version_idx').on(table.organizationId, table.versionId, table.sortOrder),
    index('infra_markings_capture_idx').on(table.organizationId, table.captureId),
  ],
);

export const infraComparisons = pgTable(
  'infra_comparisons',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    locationId: uuid('location_id').notNull(),
    taskId: uuid('task_id'),
    clientComparisonId: uuid('client_comparison_id'),
    mode: text('mode').$type<(typeof INFRA_COMPARISON_MODES)[number]>().notNull(),
    beforeCaptureId: uuid('before_capture_id'),
    afterCaptureId: uuid('after_capture_id'),
    resultEvidenceId: uuid('result_evidence_id'),
    /** 4 + 4 normalised reference pins, fit kind, adjustment, opacity and view: enough to reopen. */
    alignment: jsonb('alignment').$type<Record<string, unknown>>().notNull(),
    alignmentKind: text('alignment_kind').$type<(typeof INFRA_ALIGNMENT_KINDS)[number]>().notNull(),
    reliable: boolean('reliable').notNull().default(true),
    note: text('note'),
    sidecarConnectionId: uuid('sidecar_connection_id'),
    sidecarExternalFileId: text('sidecar_external_file_id'),
    sidecarFileName: text('sidecar_file_name'),
    createdByActorType: text('created_by_actor_type').$type<'internal' | 'external'>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    vendorId: uuid('vendor_id'),
    removedAt: ts('removed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('infra_comparisons_id_organization_id_uq').on(table.id, table.organizationId),
    index('infra_comparisons_project_idx').on(table.organizationId, table.projectId, table.createdAt),
    index('infra_comparisons_location_idx').on(table.organizationId, table.projectId, table.locationId),
    index('infra_comparisons_before_idx').on(table.beforeCaptureId),
    index('infra_comparisons_after_idx').on(table.afterCaptureId),
    index('infra_comparisons_result_idx').on(table.resultEvidenceId),
    check('infra_comparisons_mode_known', sql`${table.mode} IN ('two_photos', 'live')`),
  ],
);
