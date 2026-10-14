import type { ProjectExpenseContribution } from './cost-aggregation';
import {
  addMoney,
  compareMoney,
  fromNumericString,
  isPositiveMoney,
  minMoney,
  money,
  roundMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
/** Accepted match totals per expense id (same currency as project compose). */
export type LinkedExpenseDeductions = ReadonlyMap<string, string>;

export interface RecognizedBillMatchLink {
  readonly billId: string;
  readonly expenseId: string;
  readonly matchedAmount: string;
}

export interface RecognizedVendorBillRollupForDedupe {
  readonly billAmounts: readonly string[];
  readonly total: MoneyValue;
  readonly linkedExpenseDeductions: LinkedExpenseDeductions;
  readonly excludedForeignCurrencyCount: number;
  readonly billCount: number;
  readonly recognizedBillIds: readonly string[];
  readonly billMatchLinks: readonly RecognizedBillMatchLink[];
}

export interface LinkedExpenseMatchRow {
  readonly expenseId: string;
  /** Stored match amount (GROSS per ap_po_matches / matches.ts). */
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
  readonly expenseNetAmount?: string;
  readonly expenseGrossAmount?: string;
}

/** Project NET weights for a split expense (allocations or header-only). */
export type ExpenseProjectWeight = {
  readonly projectId: string;
  readonly weightNet: string;
};

export function expenseProjectWeightShare(
  weights: readonly ExpenseProjectWeight[],
  projectId: string,
  currency: string,
): number {
  if (weights.length === 0) return 0;
  const normalized = currency.toUpperCase();
  let total = zeroMoney(normalized);
  let slice = zeroMoney(normalized);
  for (const row of weights) {
    const amount = fromNumericString(row.weightNet, normalized);
    if (!amount) continue;
    total = addMoney(total, amount);
    if (row.projectId === projectId) slice = addMoney(slice, amount);
  }
  if (compareMoney(total, zeroMoney(normalized)) <= 0) return 0;
  return Number(slice.amount) / Number(total.amount);
}

/** F05 — split accepted match NET (or GROSS when no expense amounts) by expense project weights. */
export function distributeMatchedAmountByExpenseWeights(input: {
  readonly matchedAmount: string;
  readonly currency: string;
  readonly weights: readonly ExpenseProjectWeight[];
  readonly projectId: string;
}): string {
  const normalized = input.currency.toUpperCase();
  const share = expenseProjectWeightShare(input.weights, input.projectId, normalized);
  if (share <= 0) return zeroMoney(normalized).amount;
  const matched = money(input.matchedAmount, normalized);
  return roundMoney(money(String(Number(matched.amount) * share), normalized)).amount;
}

export function scaleAmountByExpenseProjectWeight(input: {
  readonly amount: string;
  readonly currency: string;
  readonly weights: readonly ExpenseProjectWeight[];
  readonly projectId: string;
}): string {
  return distributeMatchedAmountByExpenseWeights({
    matchedAmount: input.amount,
    currency: input.currency,
    weights: input.weights,
    projectId: input.projectId,
  });
}

/** Amount-aware deductions scoped to one project's share of split expenses. */
export function buildProjectLinkedExpenseDeductions(
  rows: readonly LinkedExpenseMatchRow[],
  projectId: string,
  weightsByExpenseId: ReadonlyMap<string, readonly ExpenseProjectWeight[]>,
  currency: string,
): Map<string, string> {
  const normalized = currency.toUpperCase();
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.expenseCurrency.toUpperCase() !== normalized) continue;
    const weights = weightsByExpenseId.get(row.expenseId);
    const netMatched = matchedNetForDedupeRow(row);
    let sliceNet = netMatched;
    if (weights && weights.length > 1) {
      sliceNet = distributeMatchedAmountByExpenseWeights({
        matchedAmount: netMatched,
        currency: normalized,
        weights,
        projectId,
      });
    } else if (weights && weights.length === 1 && weights[0]!.projectId !== projectId) {
      sliceNet = zeroMoney(normalized).amount;
    }
    const slice = money(sliceNet, normalized);
    if (!isPositiveMoney(slice)) continue;
    const prev = map.get(row.expenseId);
    map.set(row.expenseId, prev ? addMoney(money(prev, normalized), slice).amount : slice.amount);
  }
  return map;
}

/** Convert accepted match GROSS to expense NET for Actual dedupe. */
export function matchedNetFromGross(
  expenseNet: string,
  expenseGross: string,
  matchedGross: string,
  currency: string,
): string {
  const normalized = currency.toUpperCase();
  const netTotal = fromNumericString(expenseNet, normalized);
  const grossTotal = fromNumericString(expenseGross, normalized);
  const matched = fromNumericString(matchedGross, normalized);
  if (!netTotal || !grossTotal || !matched) return zeroMoney(normalized).amount;
  if (compareMoney(grossTotal, zeroMoney(normalized)) <= 0) return zeroMoney(normalized).amount;
  if (compareMoney(netTotal, grossTotal) === 0) return matched.amount;
  const ratio = Number(netTotal.amount) / Number(grossTotal.amount);
  return roundMoney(money(String(Number(matched.amount) * ratio), normalized)).amount;
}

function matchedNetForDedupeRow(row: LinkedExpenseMatchRow): string {
  const currency = row.expenseCurrency;
  if (row.expenseNetAmount && row.expenseGrossAmount) {
    return matchedNetFromGross(
      row.expenseNetAmount,
      row.expenseGrossAmount,
      row.matchedAmount,
      currency,
    );
  }
  return row.matchedAmount;
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
    const slice = money(matchedNetForDedupeRow(row), normalized);
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

/** Sum project-scoped contribution NET per expense (for partial-match bill caps). */
export function buildExpenseContributionTotalsById(
  contributions: readonly ProjectExpenseContribution[] | null | undefined,
  expenseNetFallback?: ReadonlyMap<string, string>,
  fallbackCurrency = 'ILS',
): Map<string, string> {
  const totals = new Map<string, MoneyValue>();
  if (contributions) {
    for (const line of contributions) {
      if (!line.expenseId) continue;
      const amount = fromNumericString(line.amount, line.currency);
      if (!amount) continue;
      const prev = totals.get(line.expenseId);
      totals.set(line.expenseId, prev ? addMoney(prev, amount) : amount);
    }
  }
  if (expenseNetFallback) {
    for (const [expenseId, net] of expenseNetFallback) {
      if (totals.has(expenseId)) continue;
      const parsed = fromNumericString(net, fallbackCurrency);
      if (parsed) totals.set(expenseId, parsed);
    }
  }
  const result = new Map<string, string>();
  for (const [expenseId, total] of totals) {
    result.set(expenseId, total.amount);
  }
  return result;
}

function expenseRemainderOnProject(
  expenseId: string,
  expenseTotalsById: ReadonlyMap<string, string>,
  linkedExpenseDeductions: LinkedExpenseDeductions,
  currency: string,
): MoneyValue {
  const normalized = currency.toUpperCase();
  const totalRaw = expenseTotalsById.get(expenseId);
  if (!totalRaw) return zeroMoney(normalized);
  const total = money(totalRaw, normalized);
  const deductRaw = linkedExpenseDeductions.get(expenseId) ?? '0';
  const remaining = subtractMoney(total, money(deductRaw, normalized));
  if (compareMoney(remaining, zeroMoney(normalized)) <= 0) return zeroMoney(normalized);
  return remaining;
}

/**
 * When a linked expense still has unmatched remainder, recognized bill Actual is capped
 * at accepted match totals (not full bill NET). Fully matched expenses keep bill authority.
 */
export function capRecognizedBillAmountsForPartialMatches(input: {
  readonly currency: string;
  readonly billIds: readonly string[];
  readonly billAmounts: readonly string[];
  readonly billMatchLinks: readonly RecognizedBillMatchLink[];
  readonly linkedExpenseDeductions: LinkedExpenseDeductions;
  readonly expenseTotalsById: ReadonlyMap<string, string>;
}): { readonly billAmounts: string[]; readonly total: MoneyValue } {
  const normalized = input.currency.toUpperCase();
  if (input.billAmounts.length === 0) {
    return { billAmounts: [], total: zeroMoney(normalized) };
  }

  let billMatchLinks = input.billMatchLinks;
  if (
    billMatchLinks.length === 0 &&
    input.billIds.length === 1 &&
    input.billAmounts.length === 1
  ) {
    const billId = input.billIds[0]!;
    const inferred: RecognizedBillMatchLink[] = [];
    for (const [expenseId, matchedAmount] of input.linkedExpenseDeductions) {
      const remainder = expenseRemainderOnProject(
        expenseId,
        input.expenseTotalsById,
        input.linkedExpenseDeductions,
        normalized,
      );
      if (compareMoney(remainder, zeroMoney(normalized)) <= 0) continue;
      inferred.push({ billId, expenseId, matchedAmount });
    }
    billMatchLinks = inferred;
  }

  const matchesByBill = new Map<string, RecognizedBillMatchLink[]>();
  for (const link of billMatchLinks) {
    const list = matchesByBill.get(link.billId) ?? [];
    list.push(link);
    matchesByBill.set(link.billId, list);
  }

  const capped: string[] = [];
  for (let index = 0; index < input.billAmounts.length; index += 1) {
    const billId = input.billIds[index] ?? `bill-${index}`;
    const slice = money(input.billAmounts[index]!, normalized);
    const links = matchesByBill.get(billId) ?? [];
    let hasPartialRemainder = false;
    for (const link of links) {
      const remainder = expenseRemainderOnProject(
        link.expenseId,
        input.expenseTotalsById,
        input.linkedExpenseDeductions,
        normalized,
      );
      if (compareMoney(remainder, zeroMoney(normalized)) > 0) {
        hasPartialRemainder = true;
        break;
      }
    }
    if (hasPartialRemainder) {
      let capMatched = zeroMoney(normalized);
      for (const link of links) {
        capMatched = addMoney(capMatched, money(link.matchedAmount, normalized));
      }
      capped.push(minMoney(slice, capMatched).amount);
    } else {
      capped.push(slice.amount);
    }
  }

  const parts = capped.map((amount) => money(amount, normalized));
  const total =
    parts.length === 0 ? zeroMoney(normalized) : roundMoney(sumMoney(parts, normalized));
  return { billAmounts: capped, total };
}

export function buildRecognizedBillMatchLinks(
  rows: readonly {
    readonly apBillId: string;
    readonly expenseId: string;
    readonly matchedAmount: string;
  }[],
): RecognizedBillMatchLink[] {
  return rows.map((row) => ({
    billId: row.apBillId,
    expenseId: row.expenseId,
    matchedAmount: row.matchedAmount,
  }));
}

/** Apply partial-match bill caps and refresh rollup total/count fields. */
export function applyPartialMatchPolicyToRecognizedVendorRollup<
  T extends RecognizedVendorBillRollupForDedupe,
>(
  rollup: T,
  input: {
    readonly currency: string;
    readonly expenseContributions?: readonly ProjectExpenseContribution[] | null;
    readonly expenseNetFallback?: ReadonlyMap<string, string>;
  },
): T {
  const recognizedBillIds = rollup.recognizedBillIds ?? [];
  const billMatchLinks = rollup.billMatchLinks ?? [];
  const billIds =
    recognizedBillIds.length === rollup.billAmounts.length
      ? recognizedBillIds
      : rollup.billAmounts.map((_, index) => recognizedBillIds[index] ?? `bill-${index}`);

  const expenseTotalsById = buildExpenseContributionTotalsById(
    input.expenseContributions,
    input.expenseNetFallback,
    input.currency,
  );

  const capped = capRecognizedBillAmountsForPartialMatches({
    currency: input.currency,
    billIds,
    billAmounts: rollup.billAmounts,
    billMatchLinks,
    linkedExpenseDeductions: rollup.linkedExpenseDeductions,
    expenseTotalsById,
  });

  return {
    ...rollup,
    billAmounts: capped.billAmounts,
    total: capped.total,
    billCount: capped.billAmounts.length,
    recognizedBillIds: billIds,
  };
}
