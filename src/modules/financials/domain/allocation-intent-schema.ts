/**
 * Runtime probe for migration 0084 allocation-intent columns.
 * Production may lag code deploy; fall back to pre-0084 query semantics when absent.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow } from '../data/sql-rows';

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
        const row = sqlFirstRow<{ ok: number }>(
          await db.execute(sql`
            select 1 as ok
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'expenses'
              and column_name = 'allocation_intent'
            limit 1
          `),
        );
        cachedReady = row?.ok === 1;
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

export function sqlExpenseCompanyOnlyFilter(expenseAlias = 'e'): SQL {
  return sql.raw(`and ${expenseAlias}.allocation_intent = 'company_only'`);
}

export function sqlExpenseProjectAllocateFilter(expenseAlias = 'e'): SQL {
  return sql.raw(`and ${expenseAlias}.allocation_intent = 'project_allocate'`);
}

export async function sqlExpenseAutoPoolFilterIfReady(
  db: DbExecutor,
  expenseAlias = 'e',
): Promise<SQL> {
  return (await isAllocationIntentSchemaReady(db))
    ? sqlExpenseAutoPoolFilter(expenseAlias)
    : sql``;
}
