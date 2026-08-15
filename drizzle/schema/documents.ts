import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { documentOwnerTypeEnum, documentStatusEnum } from './enums';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * Document metadata (doc 75).
 *
 * Bytes live in private Supabase Storage; this table is the authorization
 * record. Access is always decided from `organization_id` plus permissions,
 * never from the storage path — the path is for operations, not security.
 */
export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storageBucket: text('storage_bucket').notNull(),
    /** `organizations/{orgId}/documents/{documentId}/{safeFilename}` — server generated. */
    storagePath: text('storage_path').notNull(),
    /** Display only. Never used to build the storage path directly. */
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    checksum: text('checksum'),
    status: documentStatusEnum('status').notNull().default('pending'),
    storageCleanupStatus: text('storage_cleanup_status'),
    storageCleanupAttempts: integer('storage_cleanup_attempts').notNull().default(0),
    storageCleanupError: text('storage_cleanup_error'),
    storageCleanupLastAttemptedAt: timestamp('storage_cleanup_last_attempted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    folderId: uuid('folder_id'),
    category: text('category'),
    tags: text('tags'),
    expiresAt: date('expires_at', { mode: 'string' }),
    isRequired: boolean('is_required').notNull().default(false),
    requiredType: text('required_type'),
    currentVersionId: uuid('current_version_id'),
    /** standard = ordinary file; compensation = rates/pay docs — requires workforce.cost.read */
    privacyClass: text('privacy_class').notNull().default('standard'),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('documents_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('documents_storage_path_uq').on(table.storageBucket, table.storagePath),
    index('documents_org_idx').on(table.organizationId),
    index('documents_org_folder_idx').on(table.organizationId, table.folderId),
    index('documents_org_expires_idx').on(table.organizationId, table.expiresAt),
    check(
      'documents_privacy_class_known',
      sql`${table.privacyClass} IN ('standard', 'compensation')`,
    ),
    check(
      'documents_storage_cleanup_status_known',
      sql`${table.storageCleanupStatus} IS NULL OR ${table.storageCleanupStatus} IN ('pending', 'succeeded', 'failed')`,
    ),
  ],
);

/**
 * One document can be attached to several entities (an invoice PDF that is both
 * the expense evidence and the billing attachment). The owner type is a closed
 * enum rather than free text so orphaned link types cannot appear.
 */
export const documentLinks = pgTable(
  'document_links',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ownerType: documentOwnerTypeEnum('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    label: text('label'),
    /** Explicit customer-portal share marker (default hidden). */
    portalVisible: boolean('portal_visible').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_links_document_owner_uq').on(table.documentId, table.ownerType, table.ownerId),
    index('document_links_owner_idx').on(table.ownerType, table.ownerId),
    index('document_links_org_idx').on(table.organizationId),
    index('document_links_portal_visible_idx')
      .on(table.organizationId, table.ownerType, table.ownerId)
      .where(sql`${table.portalVisible}`),
  ],
);

export const documentsRelations = relations(documents, ({ many, one }) => ({
  organization: one(organizations, { fields: [documents.organizationId], references: [organizations.id] }),
  links: many(documentLinks),
}));
