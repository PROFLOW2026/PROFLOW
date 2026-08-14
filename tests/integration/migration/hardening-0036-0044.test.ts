import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applySqlMigrations,
  splitSqlStatements,
  withRawPglite,
} from '@tests/setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function applyNamed(client: { exec: (sql: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

describe('overnight migrations 0036–0045', () => {
  it('clean-starts 0000 → 0045', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ap_bills'
           AND column_name IN ('net_amount','tax_amount','gross_amount','tax_basis')`,
      );
      expect(cols.rows.length).toBe(4);
      const coCols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'change_orders'
           AND column_name = 'reversal_of_change_order_id'`,
      );
      expect(coCols.rows.length).toBe(1);
      const tables = await client.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN (
             'payment_applications','po_receipts','po_receipt_lines',
             'document_number_sequences','inventory_locations'
           )`,
      );
      expect(tables.rows.length).toBe(5);
    });
  });

  it('upgrades 0035 → 0045', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0035_boq_integrity_closure');
      const before = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ap_bills' AND column_name = 'net_amount'`,
      );
      expect(before.rows.length).toBe(0);
      await applyNamed(client, '0036_ap_vat_net_tax_gross');
      await applyNamed(client, '0037_month_close_db_freeze');
      await applyNamed(client, '0038_change_order_commercial_reversal');
      await applyNamed(client, '0039_ar_split_payment_applications');
      await applyNamed(client, '0040_po_receiving');
      await applyNamed(client, '0041_document_storage_cleanup');
      await applyNamed(client, '0042_boq_raw_money_revoke');
      await applyNamed(client, '0043_product_columns_numbering_crm_quotes');
      await applyNamed(client, '0044_inventory_locations_qty');
      await applyNamed(client, '0045_boq_reverse_allocation_changes_approve');
      const after = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ap_bills' AND column_name = 'net_amount'`,
      );
      expect(after.rows.length).toBe(1);
      const seq = await client.query(
        `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'document_number_sequences'`,
      );
      expect(seq.rows.length).toBe(1);
      const reverseSrc = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'boq_reverse_change_allocation'`,
      );
      const reverseRow = reverseSrc.rows[0] as { def?: string } | undefined;
      expect(String(reverseRow?.def ?? '')).toContain('boq.manage');
      expect(String(reverseRow?.def ?? '')).not.toContain('changes.approve');
      const coReverse = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'boq_reverse_allocations_for_change_order'`,
      );
      expect(coReverse.rows.length).toBe(1);
      const reverseCo = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'reverse_change_order'`,
      );
      expect(reverseCo.rows.length).toBe(1);
      const unwindGrant = await client.query(
        `SELECT has_function_privilege('authenticated', p.oid, 'execute') AS ok
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'boq_reverse_allocations_for_change_order'`,
      );
      expect((unwindGrant.rows[0] as { ok: boolean }).ok).toBe(false);
      const reverseCoDef = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'reverse_change_order'`,
      );
      const reverseCoSql = String(
        (reverseCoDef.rows[0] as { def?: string } | undefined)?.def ?? '',
      );
      expect(reverseCoSql).toContain('co_reversal_ctx');
      expect(reverseCoSql).not.toContain('co_reversal_latch');
      const ctxTable = await client.query(
        `SELECT 1 FROM pg_tables WHERE schemaname = 'app' AND tablename = 'co_reversal_ctx'`,
      );
      expect(ctxTable.rows.length).toBe(1);
      const ctxInsertAuth = await client.query(
        `SELECT has_table_privilege('authenticated', 'app.co_reversal_ctx', 'INSERT') AS ok`,
      );
      expect((ctxInsertAuth.rows[0] as { ok: boolean }).ok).toBe(false);
      const ctxInsertService = await client.query(
        `SELECT has_table_privilege('service_role', 'app.co_reversal_ctx', 'INSERT') AS ok`,
      );
      expect((ctxInsertService.rows[0] as { ok: boolean }).ok).toBe(false);
      const mutate = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'boq_mutate_draft_node'`,
      );
      expect(mutate.rows.length).toBe(1);
    });
  });

  it('0036 backfill: existing total_amount becomes undivided net=gross, tax=0', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0035_boq_integrity_closure');
      await client.exec(`
        INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
        VALUES ('00000000-0000-4000-8000-000000000036', 'T', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL');
        INSERT INTO vendors (id, organization_id, name, status, type)
        VALUES (
          '00000000-0000-4000-8000-000000000037',
          '00000000-0000-4000-8000-000000000036',
          'V', 'active', 'supplier'
        );
        INSERT INTO ap_bills (id, organization_id, vendor_id, status, currency, total_amount)
        VALUES (
          '00000000-0000-4000-8000-000000000038',
          '00000000-0000-4000-8000-000000000036',
          '00000000-0000-4000-8000-000000000037',
          'open', 'ILS', 117
        );
      `);
      await applyNamed(client, '0036_ap_vat_net_tax_gross');
      const row = await client.query(
        `SELECT net_amount::text, tax_amount::text, gross_amount::text, tax_basis
         FROM ap_bills WHERE id = '00000000-0000-4000-8000-000000000038'`,
      );
      const r = row.rows[0] as {
        net_amount: string;
        tax_amount: string;
        gross_amount: string;
        tax_basis: string;
      };
      expect(Number(r.net_amount)).toBe(117);
      expect(Number(r.tax_amount)).toBe(0);
      expect(Number(r.gross_amount)).toBe(117);
      expect(r.tax_basis).toBe('legacy_undivided');
    });
  });

  it('0037: direct SQL cannot insert a finalized expense into a closed month', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);
      await client.exec(`
        INSERT INTO profiles (id, email, display_name)
        VALUES ('00000000-0000-4000-8000-000000000041', 'close@example.test', 'Closer');
        INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
        VALUES ('00000000-0000-4000-8000-000000000042', 'Close', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL');
        INSERT INTO organization_memberships (organization_id, user_id, status)
        VALUES ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000041', 'active');
        SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000041', false);
        INSERT INTO month_close_periods (organization_id, year_month, status)
        VALUES ('00000000-0000-4000-8000-000000000042', '2024-01', 'open');
        UPDATE month_close_periods SET status = 'ready'
          WHERE organization_id = '00000000-0000-4000-8000-000000000042' AND year_month = '2024-01';
        UPDATE month_close_periods SET status = 'closed'
          WHERE organization_id = '00000000-0000-4000-8000-000000000042' AND year_month = '2024-01';
      `);

      let closedInsertFailed = false;
      try {
        await client.query(`
          INSERT INTO expenses (
            organization_id, expense_date, description, cost_family,
            net_amount, gross_amount, currency, status
          ) VALUES (
            '00000000-0000-4000-8000-000000000042', '2024-01-15', 'closed month',
            'business_overhead', 10, 10, 'ILS', 'finalized'
          )
        `);
      } catch (error) {
        closedInsertFailed = String(error).includes('closed_period_immutable');
      }
      expect(closedInsertFailed).toBe(true);

      let draftInsertFailed = false;
      try {
        await client.query(`
          INSERT INTO expenses (
            organization_id, expense_date, description, cost_family,
            net_amount, gross_amount, currency, status
          ) VALUES (
            '00000000-0000-4000-8000-000000000042', '2024-01-16', 'draft in closed month',
            'business_overhead', 10, 10, 'ILS', 'draft'
          )
        `);
      } catch {
        draftInsertFailed = true;
      }
      expect(draftInsertFailed).toBe(false);
    });
  });
});
