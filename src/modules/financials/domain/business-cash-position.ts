/**
 * Organization-level cash payment position — separate from recognized cost (Actual).
 * Uses canonical payment records only; never infers from free text or recognition.
 */

import { isSubcontractorEconomicCategoryKey } from './economic-classification';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

/** Canonical outgoing cash source buckets for dashboard breakdown. */
export type BusinessCashSourceKey =
  | 'expense_suppliers'
  | 'expense_subcontractors'
  | 'ap'
  | 'payroll'
  | 'subcontract_advances';

export interface BusinessCashSourceTotals {
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
}

export interface BusinessCashPosition {
  readonly currency: string;
  readonly actualPaid: MoneyValue | null;
  readonly outstandingPayable: MoneyValue | null;
  readonly sources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>>;
}

export interface ExpenseCashRow {
  readonly grossAmount: string;
  readonly paidGrossAmount: string | null;
  readonly currency: string;
  readonly categoryKey: string | null;
}

export function classifyExpenseCashSource(categoryKey: string | null): BusinessCashSourceKey {
  if (isSubcontractorEconomicCategoryKey(categoryKey)) return 'expense_subcontractors';
  return 'expense_suppliers';
}

export function aggregateExpenseCashBySource(
  rows: readonly ExpenseCashRow[],
  currency: string,
): Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>> {
  const normalized = currency.toUpperCase();
  const buckets: Partial<
    Record<BusinessCashSourceKey, { paid: MoneyValue; outstanding: MoneyValue }>
  > = {};

  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) continue;
    const source = classifyExpenseCashSource(row.categoryKey);
    const bucket = buckets[source] ?? {
      paid: zeroMoney(normalized),
      outstanding: zeroMoney(normalized),
    };

    const paid =
      fromNumericString(row.paidGrossAmount ?? '0', normalized) ?? zeroMoney(normalized);
    if (isPositiveMoney(paid)) {
      bucket.paid = addMoney(bucket.paid, paid);
    }

    const gross = fromNumericString(row.grossAmount, normalized) ?? zeroMoney(normalized);
    const remainingAmount = Math.max(0, Number(gross.amount) - Number(paid.amount));
    const remaining =
      fromNumericString(String(remainingAmount), normalized) ?? zeroMoney(normalized);
    if (isPositiveMoney(remaining)) {
      bucket.outstanding = addMoney(bucket.outstanding, remaining);
    }

    buckets[source] = bucket;
  }

  const sources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>> = {};
  for (const [key, bucket] of Object.entries(buckets) as [
    BusinessCashSourceKey,
    { paid: MoneyValue; outstanding: MoneyValue },
  ][]) {
    if (isZeroMoney(bucket.paid) && isZeroMoney(bucket.outstanding)) continue;
    sources[key] = {
      paid: roundMoney(bucket.paid),
      outstanding: roundMoney(bucket.outstanding),
    };
  }
  return sources;
}

function mergeSourceBucket(
  target: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>>,
  key: BusinessCashSourceKey,
  paid: MoneyValue,
  outstanding: MoneyValue,
): void {
  if (isZeroMoney(paid) && isZeroMoney(outstanding)) return;
  const prev = target[key];
  target[key] = {
    paid: roundMoney(addMoney(prev?.paid ?? zeroMoney(paid.currency), paid)),
    outstanding: roundMoney(
      addMoney(prev?.outstanding ?? zeroMoney(outstanding.currency), outstanding),
    ),
  };
}

export function composeBusinessCashPosition(input: {
  readonly currency: string;
  readonly expenseSources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>>;
  readonly apPaid: MoneyValue | null;
  readonly apOutstanding: MoneyValue | null;
  readonly payrollPaid: MoneyValue | null;
  readonly payrollOutstanding: MoneyValue | null;
  readonly subcontractAdvancesPaid: MoneyValue | null;
}): BusinessCashPosition {
  const currency = input.currency.toUpperCase();
  const sources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>> = {
    ...input.expenseSources,
  };

  if (input.apPaid != null || input.apOutstanding != null) {
    mergeSourceBucket(
      sources,
      'ap',
      input.apPaid ?? zeroMoney(currency),
      input.apOutstanding ?? zeroMoney(currency),
    );
  }

  if (input.payrollPaid != null || input.payrollOutstanding != null) {
    mergeSourceBucket(
      sources,
      'payroll',
      input.payrollPaid ?? zeroMoney(currency),
      input.payrollOutstanding ?? zeroMoney(currency),
    );
  }

  if (input.subcontractAdvancesPaid != null && !isZeroMoney(input.subcontractAdvancesPaid)) {
    mergeSourceBucket(sources, 'subcontract_advances', input.subcontractAdvancesPaid, zeroMoney(currency));
  }

  let actualPaid = zeroMoney(currency);
  let outstandingPayable = zeroMoney(currency);
  for (const bucket of Object.values(sources)) {
    if (!bucket) continue;
    if (isPositiveMoney(bucket.paid)) actualPaid = addMoney(actualPaid, bucket.paid);
    if (isPositiveMoney(bucket.outstanding)) {
      outstandingPayable = addMoney(outstandingPayable, bucket.outstanding);
    }
  }

  return {
    currency,
    actualPaid: isZeroMoney(actualPaid) ? null : roundMoney(actualPaid),
    outstandingPayable: isZeroMoney(outstandingPayable) ? null : roundMoney(outstandingPayable),
    sources,
  };
}
