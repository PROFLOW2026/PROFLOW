/**
 * One org-wide closed-period load per DB transaction for Financials read paths.
 * Equivalent to repeated `app.is_month_closed` / `listClosedYearMonths` under org RLS.
 */

import { and, eq } from 'drizzle-orm';
import { monthClosePeriods } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertYearMonth } from '../domain/year-month';

const closedMonthsByTx = new WeakMap<object, Promise<ReadonlySet<string>>>();

export function seedCachedClosedYearMonthsSet(
  db: object,
  closedYearMonths: readonly string[],
): void {
  closedMonthsByTx.set(db, Promise.resolve(new Set(closedYearMonths)));
}

export async function loadCachedClosedYearMonthsSet(
  context: OrgContext,
): Promise<ReadonlySet<string>> {
  const key = context.db as object;
  const hit = closedMonthsByTx.get(key);
  if (hit) return hit;
  const pending = context.db
    .select({ yearMonth: monthClosePeriods.yearMonth })
    .from(monthClosePeriods)
    .where(
      and(
        eq(monthClosePeriods.organizationId, context.organizationId),
        eq(monthClosePeriods.status, 'closed'),
      ),
    )
    .then((rows) => new Set(rows.map((row) => row.yearMonth)));
  closedMonthsByTx.set(key, pending);
  return pending;
}

export async function isMonthClosedForFinancialsRead(
  context: OrgContext,
  yearMonth: string,
): Promise<boolean> {
  const ym = assertYearMonth(yearMonth);
  const closed = await loadCachedClosedYearMonthsSet(context);
  return closed.has(ym);
}

export async function filterClosedYearMonthsForFinancialsRead(
  context: OrgContext,
  yearMonths: readonly string[],
): Promise<ReadonlySet<string>> {
  if (yearMonths.length === 0) return new Set();
  const closed = await loadCachedClosedYearMonthsSet(context);
  return new Set(yearMonths.filter((ym) => closed.has(ym)));
}
