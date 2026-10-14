import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { applyPreparedMigrations } from '@tests/setup/pending-journal-migrations';

/** Gate B stream 0184–0192 (not in journal). */
const GATE_B_PREPARED_TAGS = [
  '0184_crm_permission_rls',
  '0185_rls_0009_0011_sibling_tables',
  '0186_contract_value_events_rls_and_0174_grants',
  '0187_statutory_document_share_links',
  '0188_task_collaboration',
  '0189_expenses_closed_period_guard_payment_columns',
  '0190_connected_contract_value_projections',
  '0191_project_cover_image',
  '0192_inventory_rls',
] as const;

describe('Gate B prepared migrations (PGlite disposable)', () => {
  it('applies 0184–0192 in order and is idempotent on second pass', async () => {
    const database: TestDatabase = await createTestDatabase();
    try {
      await applyPreparedMigrations(database, GATE_B_PREPARED_TAGS);
      await applyPreparedMigrations(database, GATE_B_PREPARED_TAGS);

      await database.asService(async (db) => {
        const tables = resultRows<{ reg: string | null }>(
          await db.execute(sql`
            SELECT to_regclass('public.statutory_document_share_links') AS reg
          `),
        );
        expect(tables[0]?.reg).toBe('statutory_document_share_links');

        const column = resultRows<{ ok: boolean }>(
          await db.execute(sql`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'expenses'
                AND column_name = 'paid_after_period_close'
            ) AS ok
          `),
        );
        expect(column[0]?.ok).toBe(true);

        const inventoryPolicies = resultRows<{ n: number }>(
          await db.execute(sql`
            SELECT count(*)::int AS n FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'inventory_items'
          `),
        );
        expect(inventoryPolicies[0]?.n).toBeGreaterThanOrEqual(4);
      });
    } finally {
      await database.close();
    }
  });
});
