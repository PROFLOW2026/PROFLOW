import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

/**
 * Disposable PGlite check: 0020 overnight foundations applies with
 * tenant anchors, same-org composite FKs, AP immutability/allocation guards,
 * OCR confirmed-target shape, and planning hierarchy FKs.
 * Does not touch owner Supabase.
 */
describe('0020 overnight foundations integrity (PGlite)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates tenant identity anchors for composite FK parents', async () => {
    await database.asService(async (db) => {
      const indexes = resultRows<{ indexname: string }>(
        await db.execute(sql`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (
              'vendors_id_organization_id_uq',
              'documents_id_organization_id_uq',
              'billing_records_id_organization_id_uq',
              'expenses_id_organization_id_uq',
              'ap_bills_id_organization_id_uq',
              'ap_payments_id_organization_id_uq',
              'bank_accounts_id_organization_id_uq',
              'bank_import_batches_id_organization_id_uq',
              'bank_transactions_id_organization_id_uq',
              'phases_id_organization_id_project_id_uq',
              'work_packages_id_organization_id_project_id_uq',
              'external_access_grants_id_organization_id_uq',
              'planning_work_items_id_org_project_uq'
            )
          ORDER BY indexname
        `),
      ).map((row) => row.indexname);

      expect(indexes).toEqual([
        'ap_bills_id_organization_id_uq',
        'ap_payments_id_organization_id_uq',
        'bank_accounts_id_organization_id_uq',
        'bank_import_batches_id_organization_id_uq',
        'bank_transactions_id_organization_id_uq',
        'billing_records_id_organization_id_uq',
        'documents_id_organization_id_uq',
        'expenses_id_organization_id_uq',
        'external_access_grants_id_organization_id_uq',
        'phases_id_organization_id_project_id_uq',
        'planning_work_items_id_org_project_uq',
        'vendors_id_organization_id_uq',
        'work_packages_id_organization_id_project_id_uq',
      ]);
    });
  });

  it('creates composite same-org FKs across overnight tables', async () => {
    await database.asService(async (db) => {
      const fks = resultRows<{ conname: string }>(
        await db.execute(sql`
          SELECT conname FROM pg_constraint
          WHERE conname IN (
            'ap_payments_vendor_org_fk',
            'ap_payment_applications_payment_org_fk',
            'ap_payment_applications_bill_org_fk',
            'bank_import_batches_account_org_fk',
            'bank_transactions_account_org_fk',
            'bank_transactions_import_batch_org_fk',
            'bank_match_suggestions_tx_org_fk',
            'bank_match_decisions_tx_org_fk',
            'external_statutory_documents_billing_org_fk',
            'external_statutory_documents_pdf_doc_org_fk',
            'vendor_portal_ap_candidates_vendor_org_fk',
            'vendor_portal_ap_candidates_grant_org_fk',
            'vendor_portal_compliance_candidates_vendor_org_fk',
            'vendor_portal_compliance_candidates_grant_org_fk',
            'planning_work_items_project_org_fk',
            'planning_work_items_phase_org_project_fk',
            'planning_work_items_work_package_org_project_fk',
            'planning_dependencies_predecessor_org_project_fk',
            'planning_dependencies_successor_org_project_fk',
            'ops_expense_links_expense_org_fk',
            'ocr_extraction_jobs_document_org_fk',
            'ocr_extraction_jobs_expense_org_fk',
            'ocr_extraction_jobs_vendor_bill_org_fk'
          )
          ORDER BY conname
        `),
      ).map((row) => row.conname);

      expect(fks).toEqual([
        'ap_payment_applications_bill_org_fk',
        'ap_payment_applications_payment_org_fk',
        'ap_payments_vendor_org_fk',
        'bank_import_batches_account_org_fk',
        'bank_match_decisions_tx_org_fk',
        'bank_match_suggestions_tx_org_fk',
        'bank_transactions_account_org_fk',
        'bank_transactions_import_batch_org_fk',
        'external_statutory_documents_billing_org_fk',
        'external_statutory_documents_pdf_doc_org_fk',
        'ocr_extraction_jobs_document_org_fk',
        'ocr_extraction_jobs_expense_org_fk',
        'ocr_extraction_jobs_vendor_bill_org_fk',
        'ops_expense_links_expense_org_fk',
        'planning_dependencies_predecessor_org_project_fk',
        'planning_dependencies_successor_org_project_fk',
        'planning_work_items_phase_org_project_fk',
        'planning_work_items_project_org_fk',
        'planning_work_items_work_package_org_project_fk',
        'vendor_portal_ap_candidates_grant_org_fk',
        'vendor_portal_ap_candidates_vendor_org_fk',
        'vendor_portal_compliance_candidates_grant_org_fk',
        'vendor_portal_compliance_candidates_vendor_org_fk',
      ]);
    });
  });

  it('creates AP immutability + allocation triggers and OCR target-shape check', async () => {
    await database.asService(async (db) => {
      const triggers = resultRows<{ tgname: string }>(
        await db.execute(sql`
          SELECT tgname FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname IN (
              'ap_payment_applications_vendor_guard',
              'ap_payment_applications_allocation_guard',
              'ap_payments_guard',
              'ap_payment_applications_immutable_guard'
            )
          ORDER BY tgname
        `),
      ).map((row) => row.tgname);

      expect(triggers).toEqual([
        'ap_payment_applications_allocation_guard',
        'ap_payment_applications_immutable_guard',
        'ap_payment_applications_vendor_guard',
        'ap_payments_guard',
      ]);

      const checks = resultRows<{ conname: string }>(
        await db.execute(sql`
          SELECT conname FROM pg_constraint
          WHERE conname = 'ocr_extraction_jobs_confirmed_target_shape'
        `),
      ).map((row) => row.conname);

      expect(checks).toEqual(['ocr_extraction_jobs_confirmed_target_shape']);
    });
  });
});
