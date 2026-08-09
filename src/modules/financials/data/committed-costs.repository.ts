import { and, eq, inArray, isNull } from 'drizzle-orm';
import { apBills, committedCosts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { addMoney, fromNumericString, roundMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { remainingUnmatchedAmount } from '@/modules/ap/domain/matching';
import { listAcceptedMatchAmountsForBills } from '@/modules/ap';

const OPEN_COMMITTED_STATUSES = ['open', 'partially_consumed'] as const;
const OPEN_AP_STATUSES = ['open', 'partially_matched'] as const;

/**
 * Sum open committed costs for a project in a single currency.
 * Foreign-currency rows are excluded (count returned for coverage disclosure).
 * Committed amounts are never treated as Expense / Actual cost.
 */
export async function sumOpenCommittedCostsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number }> {
  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      amount: committedCosts.amount,
      currency: committedCosts.currency,
    })
    .from(committedCosts)
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        eq(committedCosts.projectId, projectId),
        inArray(committedCosts.status, [...OPEN_COMMITTED_STATUSES]),
      ),
    );

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount) continue;
    total = addMoney(total, amount);
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount };
}

/**
 * Sum unmatched open AP bills for a project — Forecast payable, not Expense.
 */
export async function sumOpenApPayableForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number }> {
  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      id: apBills.id,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...OPEN_AP_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const acceptedByBillId = await listAcceptedMatchAmountsForBills(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  let billCount = 0;
  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const unmatched = remainingUnmatchedAmount({
      currency: row.currency,
      billTotal: row.totalAmount,
      reservedMatchedAmounts: acceptedByBillId.get(row.id) ?? [],
    });
    total = addMoney(total, unmatched);
    billCount += 1;
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount, billCount };
}
