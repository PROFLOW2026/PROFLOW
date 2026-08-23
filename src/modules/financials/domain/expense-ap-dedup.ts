import type { ProjectExpenseContribution } from './cost-aggregation';
import {
  addMoney,
  compareMoney,
  fromNumericString,
  minMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

/** Accepted match totals per expense id (same currency as project compose). */
export type LinkedExpenseDeductions = ReadonlyMap<string, string>;

export interface LinkedExpenseMatchRow {
  readonly expenseId: string;
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
}

/**
 * Sum accepted match amounts per expense for amount-aware Actual dedupe.
 * Bill recognition wins for the matched slice; unmatched expense remainder stays in Actual.
 */
export function buildLinkedExpenseDeductions(
  rows: readonly LinkedExpenseMatchRow[],
  currency: string,
): Map<string, string> {
  const normalized = currency.toUpperCase();
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.expenseCurrency.toUpperCase() !== normalized) continue;
    const slice = money(row.matchedAmount, normalized);
    const prev = map.get(row.expenseId);
    map.set(
      row.expenseId,
      prev ? addMoney(money(prev, normalized), slice).amount : slice.amount,
    );
  }
  return map;
}

function contributionGroupTotal(
  contributions: readonly ProjectExpenseContribution[],
  indices: readonly number[],
): MoneyValue | null {
  if (indices.length === 0) return null;
  const currency = contributions[indices[0]!]!.currency;
  let total = zeroMoney(currency);
  for (const index of indices) {
    const amount = fromNumericString(contributions[index]!.amount, currency);
    if (amount) total = addMoney(total, amount);
  }
  return total;
}

/**
 * Reduce expense Actual by accepted bill-match amounts (partial-safe).
 * Multiple contribution lines for the same expense scale proportionally.
 */
export function applyLinkedExpenseDeductionsToContributions(
  contributions: readonly ProjectExpenseContribution[] | null,
  linkedDeductions: LinkedExpenseDeductions,
): readonly ProjectExpenseContribution[] {
  if (!contributions || contributions.length === 0) return [];
  if (linkedDeductions.size === 0) return contributions;

  const indicesByExpense = new Map<string, number[]>();
  for (let index = 0; index < contributions.length; index += 1) {
    const expenseId = contributions[index]!.expenseId;
    if (!expenseId || !linkedDeductions.has(expenseId)) continue;
    const list = indicesByExpense.get(expenseId) ?? [];
    list.push(index);
    indicesByExpense.set(expenseId, list);
  }

  if (indicesByExpense.size === 0) return contributions;

  const next = contributions.map((line) => ({ ...line }));
  const drop = new Set<number>();

  for (const [expenseId, indices] of indicesByExpense) {
    const deductionRaw = linkedDeductions.get(expenseId);
    if (!deductionRaw) continue;

    const total = contributionGroupTotal(contributions, indices);
    if (!total || compareMoney(total, zeroMoney(total.currency)) <= 0) {
      for (const index of indices) drop.add(index);
      continue;
    }

    const deduct = minMoney(money(deductionRaw, total.currency), total);
    const remaining = subtractMoney(total, deduct);
    if (compareMoney(remaining, zeroMoney(total.currency)) <= 0) {
      for (const index of indices) drop.add(index);
      continue;
    }

    if (compareMoney(remaining, total) === 0) continue;

    const ratio = Number(remaining.amount) / Number(total.amount);
    for (const index of indices) {
      const line = contributions[index]!;
      const amount = fromNumericString(line.amount, line.currency);
      if (!amount) {
        drop.add(index);
        continue;
      }
      const scaled = roundMoney(money(String(Number(amount.amount) * ratio), line.currency));
      if (compareMoney(scaled, zeroMoney(line.currency)) <= 0) {
        drop.add(index);
      } else {
        next[index] = { ...line, amount: scaled.amount };
      }
    }
  }

  return next.filter((_, index) => !drop.has(index));
}
