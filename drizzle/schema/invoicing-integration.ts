import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, updatedAt } from './_shared';
import { billingRecords } from './billing';
import { documents } from './documents';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * External statutory invoicing — Billing ≠ statutory issuance.
 * Local / projectflow-local provider ids are forbidden.
 */

export const externalStatutoryDocuments = pgTable(
  'external_statutory_documents',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    billingRecordId: uuid('billing_record_id').notNull(),
    providerId: text('provider_id').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    externalId: text('external_id'),
    externalNumber: text('external_number'),
    externalUrl: text('external_url'),
    pdfContentType: text('pdf_content_type'),
    pdfByteSize: integer('pdf_byte_size'),
    pdfChecksumSha256: text('pdf_checksum_sha256'),
    pdfStorageDocumentId: uuid('pdf_storage_document_id'),
    pdfFileName: text('pdf_file_name'),
    allocationReference: text('allocation_reference'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('idx_ext_stat_docs_org_billing').on(table.organizationId, table.billingRecordId),
    uniqueIndex('idx_ext_stat_docs_org_external')
      .on(table.organizationId, table.providerId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index('idx_ext_stat_docs_org_status').on(table.organizationId, table.status),
    check(
      'external_statutory_documents_provider_not_local',
      sql`${table.providerId} NOT IN ('local', 'projectflow-local')`,
    ),
    check(
      'external_statutory_documents_kind_known',
      sql`${table.kind} IN ('tax_invoice', 'credit_note', 'receipt', 'proforma', 'other')`,
    ),
    check(
      'external_statutory_documents_status_known',
      sql`${table.status} IN ('requested', 'pending', 'issued', 'allocated', 'credited', 'cancelled', 'failed')`,
    ),
    foreignKey({
      name: 'external_statutory_documents_billing_org_fk',
      columns: [table.billingRecordId, table.organizationId],
      foreignColumns: [billingRecords.id, billingRecords.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'external_statutory_documents_pdf_doc_org_fk',
      columns: [table.pdfStorageDocumentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('set null'),
  ],
);

export const externalInvoicingProviderConnections = pgTable(
  'external_invoicing_provider_connections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    status: text('status').notNull(),
    credentialsRef: text('credentials_ref'),
    capabilitiesJson: jsonb('capabilities_json').notNull().default({}),
    connectedAt: timestamp('connected_at', { withTimezone: true, mode: 'date' }),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('external_invoicing_provider_connections_org_uq').on(table.organizationId),
    check(
      'external_invoicing_provider_connections_provider_not_local',
      sql`${table.providerId} NOT IN ('local', 'projectflow-local')`,
    ),
    check(
      'external_invoicing_provider_connections_status_known',
      sql`${table.status} IN ('disconnected', 'connected', 'error')`,
    ),
  ],
);
