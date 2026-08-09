import type { BusinessDate } from '@/shared/dates';
import { addDays, compareBusinessDates } from '@/shared/dates';
import { addMoney, isPositiveMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';

export interface CashFlowBucket {
  readonly key: 'overdue' | 'next_7' | 'next_30' | 'later' | 'undated';
  readonly expectedIn: MoneyValue;
  readonly count: number;
}

export interface CashFlowOutlook {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly horizonEnd: BusinessDate;
  readonly buckets: readonly CashFlowBucket[];
  readonly note: string;
}

/**
 * Expected incoming cash from Outstanding billing with due dates.
 * Actual vs forecast: these figures are forecast collections, not Paid.
 */
export function computeIncomingCashOutlook(
  records: readonly BillingRecordSummary[],
  currency: string,
  asOf: BusinessDate,
): CashFlowOutlook {
  const horizonEnd = addDays(asOf, 30);
  const keys: CashFlowBucket['key'][] = ['overdue', 'next_7', 'next_30', 'later', 'undated'];
  const totals = new Map<CashFlowBucket['key'], MoneyValue>();
  const counts = new Map<CashFlowBucket['key'], number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  const weekEnd = addDays(asOf, 7);

  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    if (!isPositiveMoney(record.outstandingAmount)) continue;

    let key: CashFlowBucket['key'];
    if (!record.dueDate) {
      key = 'undated';
    } else if (compareBusinessDates(record.dueDate, asOf) < 0) {
      key = 'overdue';
    } else if (compareBusinessDates(record.dueDate, weekEnd) <= 0) {
      key = 'next_7';
    } else if (compareBusinessDates(record.dueDate, horizonEnd) <= 0) {
      key = 'next_30';
    } else {
      key = 'later';
    }

    totals.set(key, addMoney(totals.get(key)!, record.outstandingAmount));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    currency,
    asOf,
    horizonEnd,
    buckets: keys.map((key) => ({
      key,
      expectedIn: totals.get(key)!,
      count: counts.get(key) ?? 0,
    })),
    note: 'Forecast only — based on Outstanding billing due dates. Not Paid. Does not invent precision where due dates are missing.',
  };
}
