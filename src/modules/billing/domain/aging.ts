import { daysBetween, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { BillingRecordSummary } from './types';

export type AgingBucketKey = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_90_plus';

export interface AgingBucket {
  readonly key: AgingBucketKey;
  readonly total: MoneyValue;
  readonly count: number;
}

export interface ReceivablesAging {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly buckets: readonly AgingBucket[];
  readonly totalOutstanding: MoneyValue;
  readonly note: string;
}

function bucketForDaysPastDue(daysPastDue: number | null): AgingBucketKey {
  if (daysPastDue === null || daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'days_1_30';
  if (daysPastDue <= 60) return 'days_31_60';
  if (daysPastDue <= 90) return 'days_61_90';
  return 'days_90_plus';
}

/**
 * Aging is derived from Outstanding (never Invoiced alone) and due dates.
 * Credit notes / overpayments (negative outstanding) net into `current` so
 * totalOutstanding matches org AR. Draft/void already have zero outstanding.
 */
export function computeReceivablesAging(
  records: readonly BillingRecordSummary[],
  currency: string,
  asOf: BusinessDate,
): ReceivablesAging {
  const totals = new Map<AgingBucketKey, MoneyValue>();
  const counts = new Map<AgingBucketKey, number>();
  const keys: AgingBucketKey[] = [
    'current',
    'days_1_30',
    'days_31_60',
    'days_61_90',
    'days_90_plus',
  ];
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  let totalOutstanding = zeroMoney(currency);

  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    if (isZeroMoney(record.outstandingAmount)) continue;

    // Credits/overpayments reduce AR; they are not past-due collectibles.
    if (!isPositiveMoney(record.outstandingAmount)) {
      totals.set('current', addMoney(totals.get('current')!, record.outstandingAmount));
      counts.set('current', (counts.get('current') ?? 0) + 1);
      totalOutstanding = addMoney(totalOutstanding, record.outstandingAmount);
      continue;
    }

    const daysPastDue = record.dueDate ? daysBetween(record.dueDate, asOf) : null;
    const key = bucketForDaysPastDue(daysPastDue);
    totals.set(key, addMoney(totals.get(key)!, record.outstandingAmount));
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalOutstanding = addMoney(totalOutstanding, record.outstandingAmount);
  }

  return {
    currency,
    asOf,
    buckets: keys.map((key) => ({
      key,
      total: totals.get(key)!,
      count: counts.get(key) ?? 0,
    })),
    totalOutstanding,
    note: 'Aging uses Outstanding only (receivable now = invoiced − paid − held retention; credit notes net into current). VAT is not treated as revenue. Retention is cash timing, not a second invoice. Foreign-currency records are excluded.',
  };
}
