import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { apBills, apVendorCredits } from './ap';
import { documents } from './documents';
import { expenses } from './expenses';
import { organizations } from './tenancy';

/**
 * OCR extraction jobs — never ledger truth.
 * Confirm creates draft expense, draft vendor bill, or draft vendor credit only.
 * Strict target shape (0031): every confirmed target requires its matching ID.
 * Financial FKs use ON DELETE RESTRICT so OCR audit provenance is preserved.
 */

export const ocrExtractionJobs = pgTable(
  'ocr_extraction_jobs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id'),
    sourceFilename: text('source_filename'),
    sourceMimeType: text('source_mime_type'),
    status: text('status').notNull(),
    reviewStatus: text('review_status').notNull(),
    providerId: text('provider_id').notNull(),
    overallConfidence: numeric('overall_confidence', { precision: 9, scale: 6, mode: 'string' }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    extractedCandidates: jsonb('extracted_candidates'),
    reviewOverrides: jsonb('review_overrides'),
    acceptedFields: jsonb('accepted_fields'),
    rejectedFields: jsonb('rejected_fields'),
    rawMetadata: jsonb('raw_metadata'),
    confirmedExpenseId: uuid('confirmed_expense_id'),
    confirmedVendorBillId: uuid('confirmed_vendor_bill_id'),
    confirmedVendorCreditId: uuid('confirmed_vendor_credit_id'),
    confirmedDraftTarget: text('confirmed_draft_target'),
    ...timestamps(),
  },
  (table) => [
    index('ocr_extraction_jobs_org_status_updated_idx').on(
      table.organizationId,
      table.status,
      table.updatedAt,
    ),
    index('ocr_extraction_jobs_org_review_idx').on(table.organizationId, table.reviewStatus),
    index('ocr_extraction_jobs_org_document_idx')
      .on(table.organizationId, table.documentId)
      .where(sql`${table.documentId} is not null`),
    index('ocr_extraction_jobs_org_credit_idx')
      .on(table.organizationId, table.confirmedVendorCreditId)
      .where(sql`${table.confirmedVendorCreditId} is not null`),
    check(
      'ocr_extraction_jobs_status_known',
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'needs_review', 'rejected')`,
    ),
    check(
      'ocr_extraction_jobs_review_status_known',
      sql`${table.reviewStatus} IN ('awaiting_review', 'accepted', 'rejected')`,
    ),
    check(
      'ocr_extraction_jobs_draft_target_known',
      sql`${table.confirmedDraftTarget} IS NULL OR ${table.confirmedDraftTarget} IN ('expense', 'vendor_bill', 'vendor_credit')`,
    ),
    check(
      'ocr_extraction_jobs_confirmed_target_shape',
      sql`(
        (
          ${table.confirmedDraftTarget} IS NULL
          AND ${table.confirmedExpenseId} IS NULL
          AND ${table.confirmedVendorBillId} IS NULL
          AND ${table.confirmedVendorCreditId} IS NULL
        )
        OR (
          ${table.confirmedDraftTarget} = 'expense'
          AND ${table.confirmedExpenseId} IS NOT NULL
          AND ${table.confirmedVendorBillId} IS NULL
          AND ${table.confirmedVendorCreditId} IS NULL
        )
        OR (
          ${table.confirmedDraftTarget} = 'vendor_bill'
          AND ${table.confirmedVendorBillId} IS NOT NULL
          AND ${table.confirmedExpenseId} IS NULL
          AND ${table.confirmedVendorCreditId} IS NULL
        )
        OR (
          ${table.confirmedDraftTarget} = 'vendor_credit'
          AND ${table.confirmedVendorCreditId} IS NOT NULL
          AND ${table.confirmedExpenseId} IS NULL
          AND ${table.confirmedVendorBillId} IS NULL
        )
      )`,
    ),
    check(
      'ocr_extraction_jobs_confidence_range',
      sql`${table.overallConfidence} IS NULL OR (${table.overallConfidence} >= 0 AND ${table.overallConfidence} <= 1)`,
    ),
    foreignKey({
      name: 'ocr_extraction_jobs_document_org_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [documents.id, documents.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'ocr_extraction_jobs_expense_org_fk',
      columns: [table.confirmedExpenseId, table.organizationId],
      foreignColumns: [expenses.id, expenses.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'ocr_extraction_jobs_vendor_bill_org_fk',
      columns: [table.confirmedVendorBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'ocr_extraction_jobs_vendor_credit_org_fk',
      columns: [table.confirmedVendorCreditId, table.organizationId],
      foreignColumns: [apVendorCredits.id, apVendorCredits.organizationId],
    }).onDelete('restrict'),
  ],
);
