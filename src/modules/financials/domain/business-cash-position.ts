/**
 * Organization-level cash payment position — separate from recognized cost (Actual).
 * Uses canonical payment records only; never infers from free text or recognition.
 */

import { isSubcontractorEconomicCategoryKey } from './economic-classification';
import {
  addMoney,
  compareMoney,
  fromNumericString,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

/** Canonical outgoing cash source buckets for dashboard breakdown. */
export type BusinessCashSourceKey =
  | 'expense_suppliers'
  | 'expense_subcontractors'
  | 'ap'
  | 'payroll'
  | 'payroll_owner'
  | 'subcontract_advances';

export interface BusinessCashSourceTotals {
  /** Recorded gross cash. Payroll and zero-VAT expenses equal the net. */
  readonly paid: MoneyValue;
  readonly paidNet: MoneyValue;
  /** Remaining gross obligation. */
  readonly outstanding: MoneyValue;
  readonly outstandingNet: MoneyValue;
}

export interface BusinessCashPosition {
  readonly currency: string;
  /** Gross recorded payments. Kept so existing callers do not change meaning. */
  readonly actualPaid: MoneyValue | null;
  /** Ex-VAT recorded payments. Primary dashboard figure. */
  readonly actualPaidNet: MoneyValue | null;
  readonly outstandingPayable: MoneyValue | null;
  readonly outstandingPayableNet: MoneyValue | null;
  readonly sources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>>;
}

export interface ExpenseCashRow {
  readonly grossAmount: string;
  /** Stored net. When missing, cash is not split and net stays equal to gross. */
  readonly netAmount?: string | null;
  readonly paidGrossAmount: string | null;
  readonly currency: string;
  readonly categoryKey: string | null;
}

/**
 * Portion of a document's stored net that belongs to a gross cash slice.
 * Uses the document's own net/gross. Never divides by a statutory VAT rate.
 */
export function recordedNetPortion(
  netAmount: MoneyValue,
  grossAmount: MoneyValue,
  portionGross: MoneyValue,
): MoneyValue {
  if (
    netAmount.currency !== portionGross.currency ||
    grossAmount.currency !== portionGross.currency ||
    isZeroMoney(grossAmount) ||
    compareMoney(netAmount, grossAmount) === 0
  ) {
    return roundMoney(portionGross);
  }
  const portion = toDecimalValue(netAmount)
    .times(toDecimalValue(portionGross))
    .dividedBy(toDecimalValue(grossAmount));
  const result = roundMoney(money(portion, portionGross.currency));
  if (isNegativeMoney(result)) return zeroMoney(portionGross.currency);
  if (compareMoney(portionGross, grossAmount) <= 0 && compareMoney(result, netAmount) > 0) {
    return roundMoney(netAmount);
  }
  return result;
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
  const buckets: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>> = {};

  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) continue;
    const source = classifyExpenseCashSource(row.categoryKey);
    const bucket = buckets[source] ?? {
      paid: zeroMoney(normalized),
      paidNet: zeroMoney(normalized),
      outstanding: zeroMoney(normalized),
      outstandingNet: zeroMoney(normalized),
    };

    const paid =
      fromNumericString(row.paidGrossAmount ?? '0', normalized) ?? zeroMoney(normalized);
    const gross = fromNumericString(row.grossAmount, normalized) ?? zeroMoney(normalized);
    const storedNet =
      row.netAmount != null && row.netAmount !== ''
        ? fromNumericString(row.netAmount, normalized)
        : null;
    const paidNet =
      storedNet != null ? recordedNetPortion(storedNet, gross, paid) : paid;
    const outstandingGross = roundMoney(
      compareMoney(gross, paid) > 0 ? subtractMoney(gross, paid) : zeroMoney(normalized),
    );
    const outstandingNet =
      storedNet != null
        ? roundMoney(
            compareMoney(storedNet, paidNet) > 0
              ? subtractMoney(storedNet, paidNet)
              : zeroMoney(normalized),
          )
        : outstandingGross;

    buckets[source] = {
      paid: isPositiveMoney(paid) ? addMoney(bucket.paid, paid) : bucket.paid,
      paidNet: isPositiveMoney(paid) ? addMoney(bucket.paidNet, paidNet) : bucket.paidNet,
      outstanding: isPositiveMoney(outstandingGross)
        ? addMoney(bucket.outstanding, outstandingGross)
        : bucket.outstanding,
      outstandingNet: isPositiveMoney(outstandingGross)
        ? addMoney(bucket.outstandingNet, outstandingNet)
        : bucket.outstandingNet,
    };
  }

  const sources: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>> = {};
  for (const [key, bucket] of Object.entries(buckets) as [
    BusinessCashSourceKey,
    BusinessCashSourceTotals,
  ][]) {
    if (
      isZeroMoney(bucket.paid) &&
      isZeroMoney(bucket.paidNet) &&
      isZeroMoney(bucket.outstanding) &&
      isZeroMoney(bucket.outstandingNet)
    ) {
      continue;
    }
    sources[key] = {
      paid: roundMoney(bucket.paid),
      paidNet: roundMoney(bucket.paidNet),
      outstanding: roundMoney(bucket.outstanding),
      outstandingNet: roundMoney(bucket.outstandingNet),
    };
  }
  return sources;
}

function mergeSourceBucket(
  target: Partial<Record<BusinessCashSourceKey, BusinessCashSourceTotals>>,
  key: BusinessCashSourceKey,
  paid: MoneyValue,
  outstanding: MoneyValue,
  paidNet: MoneyValue = paid,
  outstandingNet: MoneyValue = outstanding,
): void {
  if (
    isZeroMoney(paid) &&
    isZeroMoney(outstanding) &&
    isZeroMoney(paidNet) &&
    isZeroMoney(outstandingNet)
  ) {
    return;
  }
  const prev = target[key];
  const currency = paid.currency;
  target[key] = {
    paid: roundMoney(addMoney(prev?.paid ?? zeroMoney(currency), paid)),
    paidNet: roundMoney(addMoney(prev?.paidNet ?? zeroMoney(currency), paidNet)),
    outstanding: roundMoney(addMoney(prev?.outstanding ?? zeroMoney(currency), outstanding)),
    outstandingNet: roundMoney(
      addMoney(prev?.outstandingNet ?? zeroMoney(currency), outstandingNet),
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
  readonly payrollOwnerPaid?: MoneyValue | null;
  readonly payrollOwnerOutstanding?: MoneyValue | null;
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

  if (input.payrollOwnerPaid != null || input.payrollOwnerOutstanding != null) {
    mergeSourceBucket(
      sources,
      'payroll_owner',
      input.payrollOwnerPaid ?? zeroMoney(currency),
      input.payrollOwnerOutstanding ?? zeroMoney(currency),
    );
  }

  if (input.subcontractAdvancesPaid != null && !isZeroMoney(input.subcontractAdvancesPaid)) {
    mergeSourceBucket(sources, 'subcontract_advances', input.subcontractAdvancesPaid, zeroMoney(currency));
  }

  let actualPaid = zeroMoney(currency);
  let actualPaidNet = zeroMoney(currency);
  let outstandingPayable = zeroMoney(currency);
  let outstandingPayableNet = zeroMoney(currency);
  for (const bucket of Object.values(sources)) {
    if (!bucket) continue;
    if (isPositiveMoney(bucket.paid)) actualPaid = addMoney(actualPaid, bucket.paid);
    if (isPositiveMoney(bucket.paidNet)) actualPaidNet = addMoney(actualPaidNet, bucket.paidNet);
    if (isPositiveMoney(bucket.outstanding)) {
      outstandingPayable = addMoney(outstandingPayable, bucket.outstanding);
    }
    if (isPositiveMoney(bucket.outstandingNet)) {
      outstandingPayableNet = addMoney(outstandingPayableNet, bucket.outstandingNet);
    }
  }

  return {
    currency,
    actualPaid: isZeroMoney(actualPaid) ? null : roundMoney(actualPaid),
    actualPaidNet: isZeroMoney(actualPaidNet) ? null : roundMoney(actualPaidNet),
    outstandingPayable: isZeroMoney(outstandingPayable) ? null : roundMoney(outstandingPayable),
    outstandingPayableNet: isZeroMoney(outstandingPayableNet)
      ? null
      : roundMoney(outstandingPayableNet),
    sources,
  };
}
