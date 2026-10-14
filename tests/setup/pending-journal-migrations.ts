import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import {
  PG_LITE_SNAPSHOT_PREPARED_MIGRATIONS,
  splitSqlStatements,
  type TestDatabase,
} from './database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

/**
 * Applies SQL from `drizzle/migrations/<tag>.sql` that is **not yet in the journal**
 * (Owner-approved apply only on real DBs). For disposable PGlite / throwaway Postgres tests.
 */
export async function applyPendingJournalMigrations(
  database: TestDatabase,
  tags: readonly string[],
): Promise<void> {
  await database.asService(async (db) => {
    await db.execute(sql`RESET ROLE`);
    for (const tag of tags) {
      const filePath = path.join(MIGRATIONS_DIR, `${tag}.sql`);
      const raw = await readFile(filePath, 'utf8');
      const statements = splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''));
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    }
  });
}

/** @deprecated Use `applyPendingJournalMigrations` — alias for existing tests during rename. */
export const applyPreparedMigrations = applyPendingJournalMigrations;

/** Gate A SEC stream: CRM (S04) + 0009/0011 siblings (S01 / 0185). */
export const GATE_A_SEC_PREPARED_RLS = [
  '0184_crm_permission_rls',
  '0185_rls_0009_0011_sibling_tables',
] as const;

/** S02 — audit/contracts/value-events UWM parity (0186). */
export const GATE_A_SEC_PREPARED_S02 = [
  '0186_contract_value_events_rls_and_0174_grants',
] as const;

/** S01 / OD-51 — inventory_items + inventory_movements (0192). */
export const GATE_A_SEC_PREPARED_INVENTORY = ['0192_inventory_rls'] as const;

/** Gate A SEC adversarial stack (0184–0186 + 0192; excludes 0187–0191). */
export const GATE_A_SEC_PREPARED_ADVERSARIAL = [
  ...GATE_A_SEC_PREPARED_RLS,
  ...GATE_A_SEC_PREPARED_S02,
  ...GATE_A_SEC_PREPARED_INVENTORY,
] as const;

/** K08 Wave 2 contractor contract-value projections (0190; requires 0179 base). */
export const GATE_A_CONNECT_PREPARED_K08 = ['0190_connected_contract_value_projections'] as const;

/** PGlite schema parity when Drizzle includes 0191 columns not yet in the journal snapshot. */
export const GATE_A_PG_LITE_SCHEMA_PARITY = PG_LITE_SNAPSHOT_PREPARED_MIGRATIONS;

/** SEC PGlite suites that insert `projects` via Drizzle — journal snapshot lacks 0191 until Gate B. */
export const GATE_A_SEC_PREPARED_RLS_WITH_SCHEMA_PARITY = [
  ...GATE_A_PG_LITE_SCHEMA_PARITY,
  ...GATE_A_SEC_PREPARED_RLS,
] as const;

/** F04 ledger writes under RLS (0183; journal pending). */
export const GATE_A_FIN_PREPARED_LEDGER_RLS = [
  '0183_expense_installment_payments_rls_permissions',
] as const;

/** F13 / §9.6 closed-period guards on expense payment columns + installment ledger (0189). */
export const GATE_A_FIN_PREPARED_0189 = ['0189_expenses_closed_period_guard_payment_columns'] as const;

/** Gate A FIN-CORE / F14 PGlite: schema parity + ledger RLS + 0189 guards. */
export const GATE_A_FIN_INTEGRATION_PREPARED = [
  ...GATE_A_PG_LITE_SCHEMA_PARITY,
  ...GATE_A_FIN_PREPARED_LEDGER_RLS,
  ...GATE_A_FIN_PREPARED_0189,
] as const;
