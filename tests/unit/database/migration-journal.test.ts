import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two migration runners disagree unless the journal is maintained by hand.
 *
 * `drizzle/scripts/migrate.ts` — the only path to a real environment — asks the
 * Drizzle migrator for the entries in `meta/_journal.json`, while the test
 * harnesses read every `.sql` file straight off disk. A hand-written migration
 * that never reaches the journal therefore passes the whole suite and is
 * silently skipped in production.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_PATTERN = /^\d{4}_[a-z0-9_]+$/;

interface Journal {
  readonly entries: readonly {
    readonly idx: number;
    readonly tag: string;
    readonly when: number;
  }[];
}

async function loadJournal(): Promise<Journal> {
  return JSON.parse(
    await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
}

describe('migration journal', () => {
  it('lists exactly the committed SQL files, in file order', async () => {
    const entries = await readdir(MIGRATIONS_DIR);
    const files = entries
      .filter((entry) => entry.endsWith('.sql'))
      .map((entry) => entry.replace(/\.sql$/, ''))
      .sort();

    const journal = await loadJournal();

    expect(journal.entries.map((entry) => entry.tag)).toEqual(files);
  });

  it('numbers entries consecutively from zero', async () => {
    const journal = await loadJournal();

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  it('uses stable tag shape, unique numeric prefixes, and increasing when', async () => {
    const journal = await loadJournal();
    const prefixes = new Set<string>();
    let previousWhen = -Infinity;

    for (const entry of journal.entries) {
      expect(entry.tag).toMatch(TAG_PATTERN);
      const prefix = entry.tag.slice(0, 4);
      expect(prefixes.has(prefix)).toBe(false);
      prefixes.add(prefix);
      expect(entry.when).toBeGreaterThan(previousWhen);
      previousWhen = entry.when;
    }
  });

  it('keeps frozen 0012 content-present; 0013 remains in journal chain', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);

    expect(tags).toContain('0012_ap_vendor_portal');
    expect(tags).toContain('0013_document_owner_types');

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0012_ap_vendor_portal.sql'),
      'utf8',
    );
    // Content freeze markers — must remain; do not weaken AP/portal integrity.
    expect(sql).toContain('ap_bills');
    expect(sql).toContain('ap_po_matches');
    expect(sql).toContain('external_access_grants_scope_present');
  });

  it('orders financial allocation migrations 0014→0018 after 0013', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    const from13 = tags.slice(tags.indexOf('0013_document_owner_types'));
    expect(from13.slice(0, 6)).toEqual([
      '0013_document_owner_types',
      '0014_allocation_engine',
      '0015_project_expected_remaining_cost',
      '0016_category_allocation_policy',
      '0017_periodic_allocation',
      '0018_allocation_run_integrity',
    ]);
  });

  it('places project/job entry baseline 0019 after 0018', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0018_allocation_run_integrity')).toBeLessThan(
      tags.indexOf('0019_project_job_modes_and_entry_baseline'),
    );
  });

  it('places overnight foundations 0020 after 0019', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0019_project_job_modes_and_entry_baseline')).toBeLessThan(
      tags.indexOf('0020_overnight_foundations'),
    );

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0020_overnight_foundations.sql'),
      'utf8',
    );
    expect(sql).toContain('ap_payments');
    expect(sql).toContain('ap_payment_applications');
    expect(sql).toContain('ap_bills_id_organization_id_uq');
    expect(sql).toContain('ap_payments_id_organization_id_uq');
    expect(sql).toContain('ap_payment_applications_payment_org_fk');
    expect(sql).toContain('ap_payment_applications_bill_org_fk');
    expect(sql).toContain('ap_payment_applications_vendor_guard');
    expect(sql).toContain('planning_work_items_id_org_project_uq');
    expect(sql).toContain('planning_dependencies_predecessor_org_project_fk');
    expect(sql).toContain('planning_dependencies_successor_org_project_fk');
    expect(sql).toContain('DROP POLICY IF EXISTS');
    expect(sql).toContain('bank_accounts');
    expect(sql).toContain('planning_work_items');
    expect(sql).toContain('ocr_extraction_jobs');
    expect(sql).toContain('ops_expense_links');
    expect(sql).toContain('external_statutory_documents');
    expect(sql).toContain('vendor_portal_ap_candidates');
  });

  it('places workforce contacts and allocations 0021 after 0020', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0020_overnight_foundations')).toBeLessThan(
      tags.indexOf('0021_workforce_contacts_and_allocations'),
    );
    expect(tags.indexOf('0021_workforce_contacts_and_allocations')).toBeLessThan(
      tags.indexOf('0022_master_completion_foundations'),
    );
    expect(tags.indexOf('0023_attendance_rls_and_role_backfill')).toBeLessThan(
      tags.indexOf('0024_next_gen_permissions_modules_work_entity'),
    );

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0021_workforce_contacts_and_allocations.sql'),
      'utf8',
    );
    expect(sql).toContain('primary_contact_id');
    expect(sql).toContain('projects_primary_contact_id_fk');
    expect(sql).toContain('projects_primary_contact_client_guard');
    expect(sql).toContain('employee_project_assignments');
    expect(sql).toContain('employee_project_assignments_project_org_fk');
    expect(sql).toContain('employee_project_assignments_employee_org_fk');
    expect(sql).toContain('employee_month_costs');
    expect(sql).toContain('labor_allocation_runs');
    expect(sql).toContain('labor_allocation_run_lines');
    expect(sql).toContain('ap_bill_project_allocations');
    expect(sql).toContain('labor_allocation_runs_conservation_guard');
  });

  it('places master completion foundations 0022 after 0021', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0021_workforce_contacts_and_allocations')).toBeLessThan(
      tags.indexOf('0022_master_completion_foundations'),
    );
    expect(tags.indexOf('0022_master_completion_foundations')).toBeLessThan(
      tags.indexOf('0023_attendance_rls_and_role_backfill'),
    );

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0022_master_completion_foundations.sql'),
      'utf8',
    );
    expect(sql).toContain('attendance_days');
    expect(sql).toContain('attendance_events');
    expect(sql).toContain('ap_vendor_credits');
    expect(sql).toContain('ap_credit_applications');
    expect(sql).toContain('corrects_entry_id');
    expect(sql).toContain('bulk_batch_id');
    expect(sql).toContain('vendor_engagements');
    expect(sql).toContain('time_entries_corrects_entry_org_fk');
    expect(sql).toContain('ap_vendor_credits_project_org_fk');
    expect(sql).toContain('ap_vendor_credits_guard');
  });

  it('places attendance RLS hardening 0023 after 0022', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0022_master_completion_foundations')).toBeLessThan(
      tags.indexOf('0023_attendance_rls_and_role_backfill'),
    );
    expect(tags.indexOf('0023_attendance_rls_and_role_backfill')).toBeLessThan(
      tags.indexOf('0024_next_gen_permissions_modules_work_entity'),
    );

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0023_attendance_rls_and_role_backfill.sql'),
      'utf8',
    );
    expect(sql).toContain('linked_employee_id');
    expect(sql).toContain('attendance.self');
    expect(sql).toContain('role_permissions');
    expect(sql).not.toMatch(/VARIADIC ARRAY\[[^\]]*workforce\.read/);
  });

  it('places next-gen migrations 0024–0029 after 0023', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0023_attendance_rls_and_role_backfill')).toBeLessThan(
      tags.indexOf('0024_next_gen_permissions_modules_work_entity'),
    );
    expect(tags.indexOf('0024_next_gen_permissions_modules_work_entity')).toBeLessThan(
      tags.indexOf('0025_quotes_estimates'),
    );
    expect(tags.indexOf('0028_forms_usage_command_recurring')).toBeLessThan(
      tags.indexOf('0029_next_gen_integration_hardening'),
    );
  });

  it('places gap-closure 0030 after 0029, BOQ 0032–0035 frozen, then overnight 0036–0045', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf('0034_boq_lifecycle_hardening')).toBeLessThan(
      tags.indexOf('0035_boq_integrity_closure'),
    );
    expect(tags.indexOf('0035_boq_integrity_closure')).toBeLessThan(
      tags.indexOf('0036_ap_vat_net_tax_gross'),
    );
    expect(tags.indexOf('0036_ap_vat_net_tax_gross')).toBeLessThan(
      tags.indexOf('0044_inventory_locations_qty'),
    );
    expect(tags.indexOf('0044_inventory_locations_qty')).toBeLessThan(
      tags.indexOf('0045_boq_reverse_allocation_changes_approve'),
    );
      expect(tags.indexOf('0045_boq_reverse_allocation_changes_approve')).toBeLessThan(
      tags.indexOf('0046_multi_contract_projects'),
    );
    expect(tags.indexOf('0050_wave3_operations')).toBeLessThan(
      tags.indexOf('0051_review_integrity_closure'),
    );
    expect(tags.indexOf('0051_review_integrity_closure')).toBeLessThan(
      tags.indexOf('0052_product_completion'),
    );
    expect(tags.indexOf('0052_product_completion')).toBeLessThan(
      tags.indexOf('0053_estimates_opportunity'),
    );
    expect(tags.indexOf('0053_estimates_opportunity')).toBeLessThan(
      tags.indexOf('0054_product_experience'),
    );
    expect(tags.at(-1)).toBe('0054_product_experience');

    const sql35 = await readFile(
      path.join(MIGRATIONS_DIR, '0035_boq_integrity_closure.sql'),
      'utf8',
    );
    expect(sql35).toContain('app.activate_project_boq');
    expect(sql35).toContain('app.boq_allocate_change');
    expect(sql35).toContain('boq_nodes_secure');
    expect(sql35).toContain('app.supersede_boq_progress_batch');
  });
});

