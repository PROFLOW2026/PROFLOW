import { relations } from 'drizzle-orm';
import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('documents_storage_path_uq').on(table.storageBucket, table.storagePath),
    index('documents_org_idx').on(table.organizationId),
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
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_links_document_owner_uq').on(table.documentId, table.ownerType, table.ownerId),
    index('document_links_owner_idx').on(table.ownerType, table.ownerId),
    index('document_links_org_idx').on(table.organizationId),
  ],
);

export const documentsRelations = relations(documents, ({ many, one }) => ({
  organization: one(organizations, { fields: [documents.organizationId], references: [organizations.id] }),
  links: many(documentLinks),
}));
