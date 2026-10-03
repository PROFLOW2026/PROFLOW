import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { projectLocations } from './dg-foundation';
import { documents } from './documents';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Track IJ (migration 0162): evidence, contractor document sharing, drawings register.
 * Bytes always stay in the org's external storage behind `documents`; these tables carry metadata only.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const EVIDENCE_KINDS = ['photo', 'video', 'document'] as const;
export const EVIDENCE_VISIBILITIES = ['internal', 'contractor'] as const;
export const EVIDENCE_STATUSES = ['pending', 'available', 'removed'] as const;
export type EvidenceActorTypeColumn = 'internal' | 'external' | 'system';

export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    documentId: uuid('document_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    locationId: uuid('location_id'),
    kind: text('kind').$type<(typeof EVIDENCE_KINDS)[number]>().notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    caption: text('caption'),
    visibility: text('visibility').$type<(typeof EVIDENCE_VISIBILITIES)[number]>().notNull().default('internal'),
    status: text('status').$type<(typeof EVIDENCE_STATUSES)[number]>().notNull().default('pending'),
    uploadedByActorType: text('uploaded_by_actor_type').$type<EvidenceActorTypeColumn>().notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    uploadedByPrincipalId: uuid('uploaded_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    uploadedAt: ts('uploaded_at').notNull().defaultNow(),
    availableAt: ts('available_at'),
    removedAt: ts('removed_at'),
    removedByUserId: uuid('removed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    removedByPrincipalId: uuid('removed_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('evidence_items_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('evidence_items_document_entity_uq').on(
      table.organizationId,
      table.documentId,
      table.entityType,
      table.entityId,
    ),
    index('evidence_items_entity_idx').on(
      table.organizationId,
      table.entityType,
      table.entityId,
      table.status,
      table.uploadedAt,
    ),
    index('evidence_items_project_idx').on(table.organizationId, table.projectId, table.uploadedAt),
    foreignKey({
      name: 'evidence_items_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'evidence_items_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'evidence_items_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }),
    foreignKey({
      name: 'evidence_items_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    check('evidence_items_kind_known', sql`${table.kind} IN ('photo', 'video', 'document')`),
    check('evidence_items_visibility_known', sql`${table.visibility} IN ('internal', 'contractor')`),
    check('evidence_items_status_known', sql`${table.status} IN ('pending', 'available', 'removed')`),
    check('evidence_items_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

export const DOCUMENT_SHARE_AUDIENCES = ['project_contractors', 'agreement', 'principal'] as const;

export const documentShares = pgTable(
  'document_shares',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    documentId: uuid('document_id').notNull(),
    audience: text('audience').$type<(typeof DOCUMENT_SHARE_AUDIENCES)[number]>().notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    note: text('note'),
    acknowledgementRequired: boolean('acknowledgement_required').notNull().default(false),
    sharedByUserId: uuid('shared_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    sharedAt: ts('shared_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
    revokedByUserId: uuid('revoked_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_shares_id_organization_id_uq').on(table.id, table.organizationId),
    index('document_shares_project_idx').on(table.organizationId, table.projectId, table.sharedAt),
    index('document_shares_document_idx').on(table.organizationId, table.documentId),
    foreignKey({
      name: 'document_shares_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'document_shares_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('cascade'),
    check(
      'document_shares_audience_known',
      sql`${table.audience} IN ('project_contractors', 'agreement', 'principal')`,
    ),
  ],
);

export const documentShareAcknowledgements = pgTable(
  'document_share_acknowledgements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    shareId: uuid('share_id').notNull(),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    acknowledgedAt: ts('acknowledged_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_share_acknowledgements_share_principal_uq').on(table.shareId, table.principalId),
    index('document_share_acknowledgements_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'document_share_acknowledgements_share_fk',
      columns: [table.shareId, table.organizationId],
      foreignColumns: [documentShares.id, documentShares.organizationId],
    }).onDelete('cascade'),
  ],
);

export const DRAWING_DISCIPLINES = [
  'architecture',
  'structure',
  'mechanical',
  'electrical',
  'plumbing',
  'hvac',
  'fire_protection',
  'civil',
  'landscape',
  'interior',
  'aluminium',
  'survey',
  'other',
] as const;
export const DRAWING_CONTRACTOR_VISIBILITIES = ['internal', 'all_contractors', 'distribution'] as const;
export const DRAWING_STATUSES = ['active', 'archived'] as const;

export const drawings = pgTable(
  'drawings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    drawingNumber: text('drawing_number').notNull(),
    title: text('title').notNull(),
    discipline: text('discipline').$type<(typeof DRAWING_DISCIPLINES)[number]>().notNull().default('architecture'),
    locationId: uuid('location_id'),
    contractorVisibility: text('contractor_visibility')
      .$type<(typeof DRAWING_CONTRACTOR_VISIBILITIES)[number]>()
      .notNull()
      .default('internal'),
    status: text('status').$type<(typeof DRAWING_STATUSES)[number]>().notNull().default('active'),
    currentRevisionId: uuid('current_revision_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('drawings_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('drawings_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('drawings_number_uq').on(table.organizationId, table.projectId, sql`lower(${table.drawingNumber})`),
    index('drawings_project_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.discipline,
      table.drawingNumber,
    ),
    foreignKey({
      name: 'drawings_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'drawings_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    check('drawings_visibility_known', sql`${table.contractorVisibility} IN ('internal', 'all_contractors', 'distribution')`),
    check('drawings_status_known', sql`${table.status} IN ('active', 'archived')`),
  ],
);

export const DRAWING_REVISION_STATUSES = ['draft', 'current', 'superseded', 'withdrawn'] as const;

export const drawingRevisions = pgTable(
  'drawing_revisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    drawingId: uuid('drawing_id').notNull(),
    revisionLabel: text('revision_label').notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').$type<(typeof DRAWING_REVISION_STATUSES)[number]>().notNull().default('draft'),
    issueDate: date('issue_date', { mode: 'string' }),
    description: text('description'),
    documentId: uuid('document_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    fileReady: boolean('file_ready').notNull().default(false),
    supersedesRevisionId: uuid('supersedes_revision_id'),
    acknowledgementRequired: boolean('acknowledgement_required').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    publishedAt: ts('published_at'),
    publishedByUserId: uuid('published_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    supersededAt: ts('superseded_at'),
    supersededByRevisionId: uuid('superseded_by_revision_id'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('drawing_revisions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('drawing_revisions_id_org_drawing_uq').on(table.id, table.organizationId, table.drawingId),
    uniqueIndex('drawing_revisions_label_uq')
      .on(table.organizationId, table.drawingId, sql`lower(${table.revisionLabel})`)
      .where(sql`${table.status} <> 'withdrawn'`),
    uniqueIndex('drawing_revisions_sequence_uq').on(table.organizationId, table.drawingId, table.sequence),
    uniqueIndex('drawing_revisions_one_current_uq')
      .on(table.organizationId, table.drawingId)
      .where(sql`${table.status} = 'current'`),
    index('drawing_revisions_project_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.publishedAt,
    ),
    foreignKey({
      name: 'drawing_revisions_drawing_fk',
      columns: [table.drawingId, table.organizationId, table.projectId],
      foreignColumns: [drawings.id, drawings.organizationId, drawings.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'drawing_revisions_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }),
    check(
      'drawing_revisions_status_known',
      sql`${table.status} IN ('draft', 'current', 'superseded', 'withdrawn')`,
    ),
  ],
);

export const DRAWING_DISTRIBUTION_AUDIENCES = ['agreement', 'principal'] as const;

export const drawingDistributionEntries = pgTable(
  'drawing_distribution_entries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    drawingId: uuid('drawing_id').notNull(),
    audience: text('audience').$type<(typeof DRAWING_DISTRIBUTION_AUDIENCES)[number]>().notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    addedByUserId: uuid('added_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('drawing_distribution_drawing_idx').on(table.organizationId, table.drawingId),
    foreignKey({
      name: 'drawing_distribution_drawing_fk',
      columns: [table.drawingId, table.organizationId, table.projectId],
      foreignColumns: [drawings.id, drawings.organizationId, drawings.projectId],
    }).onDelete('cascade'),
    check('drawing_distribution_audience_known', sql`${table.audience} IN ('agreement', 'principal')`),
  ],
);

export const drawingRevisionAcknowledgements = pgTable(
  'drawing_revision_acknowledgements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    drawingId: uuid('drawing_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    acknowledgedAt: ts('acknowledged_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('drawing_revision_ack_revision_principal_uq').on(table.revisionId, table.principalId),
    index('drawing_revision_ack_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'drawing_revision_ack_revision_fk',
      columns: [table.revisionId, table.organizationId, table.drawingId],
      foreignColumns: [drawingRevisions.id, drawingRevisions.organizationId, drawingRevisions.drawingId],
    }).onDelete('cascade'),
  ],
);
