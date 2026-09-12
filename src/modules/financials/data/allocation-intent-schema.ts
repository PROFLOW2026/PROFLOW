/**
 * Runtime probe for migration 0084 allocation-intent columns.
 * Production may lag code deploy; fall back to pre-0084 query semantics when absent.
 */

import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import { apBills, employees, expenses, laborAllocationRuns } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow } from './sql-rows';

const ALLOCATION_INTENT_0084_COLUMN_COUNT = 4;

let cachedReady: boolean | null = null;
let probeInFlight: Promise<boolean> | null = null;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

let readyOverride: boolean | undefined;

/** Test-only override — mirrors other schema gate helpers. */
export function setAllocationIntentSchemaReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setAllocationIntentSchemaReadyForTests is test-only');
  }
  readyOverride = ready;
  cachedReady = ready ?? null;
  probeInFlight = null;
}

export async function isAllocationIntentSchemaReady(db: DbExecutor): Promise<boolean> {
  if (readyOverride !== undefined) return readyOverride;
  if (cachedReady !== null) return cachedReady;
  if (!probeInFlight) {
    probeInFlight = (async () => {
      try {
        const row = sqlFirstRow<{ cols: number }>(
          await db.execute(sql`
            select count(*)::int as cols
            from information_schema.columns
            where table_schema = 'public'
              and (
                (table_name = 'expenses' and column_name = 'allocation_intent')
                or (table_name = 'ap_bills' and column_name = 'remainder_allocation_intent')
                or (table_name = 'employees' and column_name = 'compensation_class')
                or (table_name = 'labor_allocation_runs' and column_name = 'company_only_amount')
              )
          `),
        );
        cachedReady = row?.cols === ALLOCATION_INTENT_0084_COLUMN_COUNT;
      } catch {
        cachedReady = false;
      }
      return cachedReady;
    })();
  }
  return probeInFlight;
}

/** 0084+: auto-pool general expenses only. Pre-0084: no intent column (handled by caller omitting filter). */
export function sqlExpenseAutoPoolFilter(expenseAlias = 'e'): SQL {
  return sql.raw(`and ${expenseAlias}.allocation_intent = 'auto_pool'`);
}

export async function sqlExpenseAutoPoolFilterIfReady(
  db: DbExecutor,
  expenseAlias = 'e',
): Promise<SQL> {
  return (await isAllocationIntentSchemaReady(db))
    ? sqlExpenseAutoPoolFilter(expenseAlias)
    : sql``;
}

export async function apBillSelectColumns(db: DbExecutor) {
  const cols = getTableColumns(apBills);
  if (await isAllocationIntentSchemaReady(db)) return cols;
  const { remainderAllocationIntent: _omit, ...rest } = cols;
  return rest;
}

export function withApBillLegacyDefaults(
  row: Partial<typeof apBills.$inferSelect> &
    Omit<typeof apBills.$inferSelect, 'remainderAllocationIntent'>,
): typeof apBills.$inferSelect {
  return {
    ...row,
    remainderAllocationIntent: row.remainderAllocationIntent ?? 'auto_pool',
  } as typeof apBills.$inferSelect;
}

export async function omitApBillInsertValues(
  db: DbExecutor,
  values: typeof apBills.$inferInsert,
): Promise<typeof apBills.$inferInsert> {
  if (await isAllocationIntentSchemaReady(db)) return values;
  const { remainderAllocationIntent: _omit, ...rest } = values;
  return rest;
}

export async function omitApBillPatchValues(
  db: DbExecutor,
  patch: Partial<typeof apBills.$inferInsert>,
): Promise<Partial<typeof apBills.$inferInsert>> {
  if (await isAllocationIntentSchemaReady(db)) return patch;
  const { remainderAllocationIntent: _omit, ...rest } = patch;
  return rest;
}

export async function employeeSelectColumns(db: DbExecutor) {
  const cols = getTableColumns(employees);
  if (await isAllocationIntentSchemaReady(db)) return cols;
  const { compensationClass: _c, defaultLaborAllocationIntent: _d, ...rest } = cols;
  return rest;
}

export async function omitEmployeeInsertValues(
  db: DbExecutor,
  values: typeof employees.$inferInsert,
): Promise<typeof employees.$inferInsert> {
  if (await isAllocationIntentSchemaReady(db)) return values;
  const { compensationClass: _c, defaultLaborAllocationIntent: _d, ...rest } = values;
  return rest;
}

export async function omitEmployeePatchValues(
  db: DbExecutor,
  patch: Partial<typeof employees.$inferInsert>,
): Promise<Partial<typeof employees.$inferInsert>> {
  if (await isAllocationIntentSchemaReady(db)) return patch;
  const { compensationClass: _c, defaultLaborAllocationIntent: _d, ...rest } = patch;
  return rest;
}

export async function expenseSelectColumns(db: DbExecutor) {
  const cols = getTableColumns(expenses);
  if (await isAllocationIntentSchemaReady(db)) return cols;
  const { allocationIntent: _omit, ...rest } = cols;
  return rest;
}

export async function laborAllocationRunSelectColumns(db: DbExecutor) {
  const cols = getTableColumns(laborAllocationRuns);
  if (await isAllocationIntentSchemaReady(db)) return cols;
  const { companyOnlyAmount: _omit, ...rest } = cols;
  return rest;
}

export async function omitLaborAllocationRunInsertValues(
  db: DbExecutor,
  values: typeof laborAllocationRuns.$inferInsert,
): Promise<typeof laborAllocationRuns.$inferInsert> {
  if (await isAllocationIntentSchemaReady(db)) return values;
  const { companyOnlyAmount: _omit, ...rest } = values;
  return rest;
}

export function withLaborAllocationRunLegacyDefaults(
  row: Partial<typeof laborAllocationRuns.$inferSelect> &
    Omit<typeof laborAllocationRuns.$inferSelect, 'companyOnlyAmount'>,
): typeof laborAllocationRuns.$inferSelect {
  return {
    ...row,
    companyOnlyAmount: row.companyOnlyAmount ?? '0',
  } as typeof laborAllocationRuns.$inferSelect;
}
