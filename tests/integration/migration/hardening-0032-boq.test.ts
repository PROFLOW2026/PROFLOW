import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applySqlMigrations,
  splitSqlStatements,
  withRawPglite,
} from '@tests/setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function applyNamed(
  client: { exec: (statement: string) => Promise<unknown> },
  tag: string,
): Promise<void> {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

describe('migration hardening 0032–0035 BOQ', () => {
  it('clean-starts through 0035 with BOQ integrity RPCs', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);

      const tables = await client.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN (
             'project_boqs',
             'boq_nodes',
             'boq_progress_batches',
             'boq_progress_lines',
             'boq_progress_billing_links',
             'boq_change_allocations',
             'boq_subcontractor_schedules'
           )
         ORDER BY tablename`,
      );
      expect(tables.rows.map((row) => (row as { tablename: string }).tablename)).toEqual([
        'boq_change_allocations',
        'boq_nodes',
        'boq_progress_batches',
        'boq_progress_billing_links',
        'boq_progress_lines',
        'boq_subcontractor_schedules',
        'project_boqs',
      ]);

      const claimFn = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'activate_project_boq'`,
      );
      expect(claimFn.rows.length).toBe(1);

      const view = await client.query(
        `SELECT 1 FROM information_schema.views
         WHERE table_schema = 'public' AND table_name = 'boq_nodes_secure'`,
      );
      expect(view.rows.length).toBe(1);
    });
  });

  it('upgrades 0031 → 0032 → 0033 → 0034 → 0035 without rewriting frozen migrations', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0031_ocr_vendor_credit_target');
      await applyNamed(client, '0032_boq_progress_billing');
      await applyNamed(client, '0033_boq_rls_hardening');
      await applyNamed(client, '0034_boq_lifecycle_hardening');
      await applyNamed(client, '0035_boq_integrity_closure');
      const activate = await client.query(
        `SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app' AND p.proname = 'activate_project_boq'`,
      );
      expect(activate.rows.length).toBe(1);
    });
  });
});
