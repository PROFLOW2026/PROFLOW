import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { documents } from './documents';
import { documentVersions } from './platform-ops';
import { profiles } from './identity';
import { organizations } from './tenancy';

export const STORAGE_PROVIDERS = ['onedrive', 'google_drive', 'dropbox', 'box'] as const;
export type StorageProviderKey = (typeof STORAGE_PROVIDERS)[number];

export const STORAGE_CONNECTION_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'reconnect_required',
  'error',
] as const;

export const SEMANTIC_FOLDER_TYPES = [
  'organization_root',
  'clients_root',
  'client_root',
  'project_root',
  'quotes',
  'contracts',
  'billing',
  'vendor_invoices',
  'plans',
  'photos',
  'documents',
  'general_files',
  'vendors_root',
  'employees_root',
  'organization_documents',
] as const;
export type SemanticFolderType = (typeof SEMANTIC_FOLDER_TYPES)[number];

export const FOLDER_MAPPING_STATUSES = ['pending', 'ready', 'error'] as const;
export const STORAGE_FILE_STATUSES = ['pending', 'synced', 'missing', 'error', 'deleted'] as const;

/** Organization-level OAuth connection to an external file provider. */
export const organizationStorageConnections = pgTable(
  'organization_storage_connections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('disconnected'),
    isPrimary: boolean('is_primary').notNull().default(false),
    externalAccountId: text('external_account_id'),
    externalAccountName: text('external_account_name'),
    externalAccountEmail: text('external_account_email'),
    externalTenantId: text('external_tenant_id'),
    rootFolderExternalId: text('root_folder_external_id'),
    rootFolderName: text('root_folder_name').notNull().default('ProjectFlow'),
    scopesJson: jsonb('scopes_json').$type<string[]>().notNull().default([]),
    capabilitiesJson: jsonb('capabilities_json').$type<Record<string, unknown>>().notNull().default({}),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true, mode: 'date' }),
    connectedByUserId: uuid('connected_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    connectedAt: timestamp('connected_at', { withTimezone: true, mode: 'date' }),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    quotaUsedBytes: bigint('quota_used_bytes', { mode: 'number' }),
    quotaTotalBytes: bigint('quota_total_bytes', { mode: 'number' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_storage_connections_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('organization_storage_connections_org_provider_uq').on(
      table.organizationId,
      table.provider,
    ),
    index('organization_storage_connections_org_status_idx').on(table.organizationId, table.status),
    check(
      'organization_storage_connections_provider_known',
      sql`${table.provider} IN ('onedrive', 'google_drive', 'dropbox', 'box')`,
    ),
    check(
      'organization_storage_connections_status_known',
      sql`${table.status} IN ('disconnected', 'connecting', 'connected', 'reconnect_required', 'error')`,
    ),
  ],
);

export const storageFolderMappings = pgTable(
  'storage_folder_mappings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').notNull(),
    semanticFolderType: text('semantic_folder_type').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    externalFolderId: text('external_folder_id').notNull(),
    externalParentId: text('external_parent_id'),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('pending'),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('storage_folder_mappings_id_org_uq').on(table.id, table.organizationId),
    index('storage_folder_mappings_entity_idx').on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
    foreignKey({
      name: 'storage_folder_mappings_connection_org_fk',
      columns: [table.connectionId, table.organizationId],
      foreignColumns: [organizationStorageConnections.id, organizationStorageConnections.organizationId],
    }).onDelete('cascade'),
    check(
      'storage_folder_mappings_status_known',
      sql`${table.status} IN ('pending', 'ready', 'error')`,
    ),
  ],
);

export const storageFiles = pgTable(
  'storage_files',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').notNull(),
    documentId: uuid('document_id'),
    documentVersionId: uuid('document_version_id'),
    externalFileId: text('external_file_id').notNull(),
    externalParentFolderId: text('external_parent_folder_id'),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    externalEtag: text('external_etag'),
    checksum: text('checksum'),
    status: text('status').notNull().default('synced'),
    lastError: text('last_error'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('storage_files_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('storage_files_external_uq').on(
      table.organizationId,
      table.connectionId,
      table.externalFileId,
    ),
    index('storage_files_document_idx').on(table.organizationId, table.documentId),
    foreignKey({
      name: 'storage_files_connection_org_fk',
      columns: [table.connectionId, table.organizationId],
      foreignColumns: [organizationStorageConnections.id, organizationStorageConnections.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'storage_files_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'storage_files_version_org_fk',
      columns: [table.documentVersionId, table.organizationId],
      foreignColumns: [documentVersions.id, documentVersions.organizationId],
    }).onDelete('set null'),
    check(
      'storage_files_status_known',
      sql`${table.status} IN ('pending', 'synced', 'missing', 'error', 'deleted')`,
    ),
  ],
);

export const organizationStorageConnectionsRelations = relations(
  organizationStorageConnections,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [organizationStorageConnections.organizationId],
      references: [organizations.id],
    }),
    folderMappings: many(storageFolderMappings),
    files: many(storageFiles),
  }),
);
