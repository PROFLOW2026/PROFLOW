import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { ocrExtractionJobs } from './ocr';
import { organizations } from './tenancy';

/** Inbound expense file imports — separate from outbound statutory documents. */
export const externalExpenseImports = pgTable(
  'external_expense_imports',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalDocumentId: text('external_document_id').notNull(),
    sourceDocumentType: integer('source_document_type'),
    status: text('status').notNull(),
    ocrJobId: uuid('ocr_job_id').references(() => ocrExtractionJobs.id, { onDelete: 'set null' }),
    pdfChecksumSha256: text('pdf_checksum_sha256'),
    detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true, mode: 'date' }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('external_expense_imports_org_provider_doc_uq').on(
      table.organizationId,
      table.provider,
      table.externalDocumentId,
    ),
    index('external_expense_imports_org_status_idx').on(
      table.organizationId,
      table.status,
      table.updatedAt.desc(),
    ),
    index('external_expense_imports_ocr_job_idx')
      .on(table.ocrJobId)
      .where(sql`${table.ocrJobId} IS NOT NULL`),
    check(
      'external_expense_imports_provider_known',
      sql`${table.provider} IN ('sumit')`,
    ),
    check(
      'external_expense_imports_status_known',
      sql`${table.status} IN ('detected', 'ocr_queued', 'needs_review', 'failed', 'linked', 'ignored')`,
    ),
  ],
);
