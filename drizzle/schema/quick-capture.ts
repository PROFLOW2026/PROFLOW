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
import { primaryId, timestamps } from './_shared';
import { documents } from './documents';
import { profiles } from './identity';
import { ocrExtractionJobs } from './ocr';
import { projects } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Quick Capture Smart Inbox — session orchestration only; never ledger truth.
 * Physical bytes live on canonical `documents`; relation via junction table.
 *
 * Composite FKs use org-scoped references. Applied migration 0131 uses PostgreSQL
 * column-specific ON DELETE SET NULL (optional_id only) so organization_id stays NOT NULL.
 */

export const quickCaptureItems = pgTable(
  'quick_capture_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => profiles.id),
    status: text('status').notNull(),
    source: text('source').notNull(),
    sessionKind: text('session_kind').notNull(),
    documentCount: integer('document_count').notNull().default(1),
    ownerNote: text('owner_note'),
    explicitProjectId: uuid('explicit_project_id'),
    detectedType: text('detected_type'),
    detectionConfidence: text('detection_confidence'),
    ownerSelectedType: text('owner_selected_type'),
    suggestedProjectId: uuid('suggested_project_id'),
    suggestedVendorId: uuid('suggested_vendor_id'),
    suggestionMetadata: jsonb('suggestion_metadata').notNull().default({}),
    primaryOcrJobId: uuid('primary_ocr_job_id'),
    selectedFinancialDocumentId: uuid('selected_financial_document_id'),
    routedEntityType: text('routed_entity_type'),
    routedEntityId: uuid('routed_entity_id'),
    processingErrorCode: text('processing_error_code'),
    processingErrorMessage: text('processing_error_message'),
    idempotencyKey: text('idempotency_key'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('quick_capture_items_id_organization_id_uq').on(table.id, table.organizationId),
    index('quick_capture_items_org_status_captured_idx').on(
      table.organizationId,
      table.status,
      table.capturedAt,
    ),
    index('quick_capture_items_org_creator_captured_idx').on(
      table.organizationId,
      table.createdByUserId,
      table.capturedAt,
    ),
    uniqueIndex('quick_capture_items_org_idempotency_uq')
      .on(table.organizationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check(
      'quick_capture_items_status_known',
      sql`${table.status} IN ('captured', 'processing', 'ready_for_review', 'approved', 'rejected', 'archived', 'failed')`,
    ),
    check(
      'quick_capture_items_source_known',
      sql`${table.source} IN ('quick_capture', 'dashboard', 'fab')`,
    ),
    check(
      'quick_capture_items_session_kind_known',
      sql`${table.sessionKind} IN ('images', 'video', 'pdf', 'file')`,
    ),
    check(
      'quick_capture_items_detection_confidence_known',
      sql`${table.detectionConfidence} IS NULL OR ${table.detectionConfidence} IN ('confirmed', 'suggested', 'unknown')`,
    ),
    check(
      'quick_capture_items_detected_type_known',
      sql`${table.detectedType} IS NULL OR ${table.detectedType} IN ('financial_document', 'field_media', 'other_document', 'unknown')`,
    ),
    check(
      'quick_capture_items_owner_selected_type_known',
      sql`${table.ownerSelectedType} IS NULL OR ${table.ownerSelectedType} IN ('financial_document', 'field_media', 'other_document', 'unknown')`,
    ),
    check(
      'quick_capture_items_document_count_range',
      sql`${table.documentCount} >= 1 AND ${table.documentCount} <= 5`,
    ),
    foreignKey({
      name: 'quick_capture_items_selected_fin_doc_org_fk',
      columns: [table.selectedFinancialDocumentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quick_capture_items_primary_ocr_org_fk',
      columns: [table.primaryOcrJobId, table.organizationId],
      foreignColumns: [ocrExtractionJobs.id, ocrExtractionJobs.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quick_capture_items_explicit_project_org_fk',
      columns: [table.explicitProjectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quick_capture_items_suggested_project_org_fk',
      columns: [table.suggestedProjectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quick_capture_items_suggested_vendor_org_fk',
      columns: [table.suggestedVendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('set null'),
  ],
);

export const quickCaptureItemDocuments = pgTable(
  'quick_capture_item_documents',
  {
    id: primaryId(),
    quickCaptureItemId: uuid('quick_capture_item_id')
      .notNull()
      .references(() => quickCaptureItems.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    ocrJobId: uuid('ocr_job_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('quick_capture_item_documents_item_doc_uq').on(
      table.quickCaptureItemId,
      table.documentId,
    ),
    uniqueIndex('quick_capture_item_documents_item_position_uq').on(
      table.quickCaptureItemId,
      table.position,
    ),
    index('quick_capture_item_documents_document_idx').on(table.documentId),
    check(
      'quick_capture_item_documents_position_range',
      sql`${table.position} >= 0 AND ${table.position} < 5`,
    ),
    foreignKey({
      name: 'quick_capture_item_documents_doc_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'quick_capture_item_documents_item_org_fk',
      columns: [table.quickCaptureItemId, table.organizationId],
      foreignColumns: [quickCaptureItems.id, quickCaptureItems.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'quick_capture_item_documents_ocr_job_org_fk',
      columns: [table.ocrJobId, table.organizationId],
      foreignColumns: [ocrExtractionJobs.id, ocrExtractionJobs.organizationId],
    }).onDelete('set null'),
  ],
);
