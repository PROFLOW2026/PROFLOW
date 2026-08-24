/**
 * Post-apply verification for migration 0069 (Owner DB).
 * Read-only — does not mutate schema.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const EXPECTED_TABLES = [
  'expense_managerial_schedule_lines',
  'recurring_draft_amount_versions',
  'general_cost_months',
  'general_cost_month_allocations',
  'general_cost_month_sources',
  'inventory_cost_layers',
  'inventory_cost_consumptions',
];

const EXPECTED_FUNCTIONS = [
  'general_cost_month_closed_period_guard',
  'inventory_cost_layers_expense_source_guard',
  'inventory_cost_consumptions_source_provenance_guard',
  'inventory_items_cost_basis_reconcile',
];

try {
  const [{ count: migCount }] = await sql`
    SELECT count(*)::int AS count
    FROM drizzle.__drizzle_migrations
  `;
  const migrations = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at
  `;
  const last = migrations.at(-1);
  const applied0069 = migrations.length === 69;

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${EXPECTED_TABLES})
    ORDER BY table_name
  `;
  const foundTables = tables.map((r) => r.table_name);

  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name IN (
        'installment_count',
        'installment_start_date',
        'inventory_stock_purchase',
        'inventory_item_id',
        'inventory_purchase_qty'
      )
    ORDER BY column_name
  `;

  const fns = await sql`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname = ANY(${EXPECTED_FUNCTIONS})
    ORDER BY p.proname
  `;
  const foundFns = fns.map((r) => r.proname);

  const journal = JSON.parse(
    readFileSync('drizzle/migrations/meta/_journal.json', 'utf8'),
  );
  const journalLast = journal.entries.at(-1)?.tag;

  const ok =
    applied0069 &&
    journalLast === '0069_true_cost_profitability' &&
    foundTables.length === EXPECTED_TABLES.length &&
    cols.length === 5 &&
    foundFns.length === EXPECTED_FUNCTIONS.length;

  console.log(
    JSON.stringify(
      {
        ok,
        migrationRows: migCount,
        migrationCount: migrations.length,
        lastMigrationId: last?.id ?? null,
        journalLast,
        tables: foundTables,
        expenseColumns: cols.map((c) => c.column_name),
        functions: foundFns,
      },
      null,
      2,
    ),
  );

  if (!ok) process.exit(1);
} finally {
  await sql.end();
}
