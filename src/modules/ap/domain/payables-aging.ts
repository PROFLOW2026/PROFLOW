/**
 * AP payables aging — derived from Outstanding (never billed alone).
 * Mirror of AR aging buckets; cash only — not Actual Cost.
 */

import { daysBetween, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { computeBillOutstanding, type BillPayableInput } from './vendor-payments';

export type ApAgingBucketKey =
  | 'current'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'days_90_plus';

export interface ApAgingBucket {
  readonly key: ApAgingBucketKey;
  readonly total: MoneyValue;
  readonly count: number;
}

export interface PayablesAging {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly buckets: readonly ApAgingBucket[];
  readonly totalOutstanding: MoneyValue;
  readonly note: string;
}

export interface ApAgingBillInput extends BillPayableInput {
  readonly dueDate: BusinessDate | null;
  readonly projectId: string | null;
  readonly vendorId: string;
}

function bucketForDaysPastDue(daysPastDue: number | null): ApAgingBucketKey {
  if (daysPastDue === null || daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'days_1_30';
  if (daysPastDue <= 60) return 'days_31_60';
  if (daysPastDue <= 90) return 'days_61_90';
  return 'days_90_plus';
}

export function computePayablesAging(
  bills: readonly ApAgingBillInput[],
  currency: string,
  asOf: BusinessDate,
): PayablesAging {
  const code = currency.toUpperCase();
  const keys: ApAgingBucketKey[] = [
    'current',
    'days_1_30',
    'days_31_60',
    'days_61_90',
    'days_90_plus',
  ];
  const totals = new Map<ApAgingBucketKey, MoneyValue>();
  const counts = new Map<ApAgingBucketKey, number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(code));
    counts.set(key, 0);
  }

  let totalOutstanding = zeroMoney(code);

  for (const bill of bills) {
    if (bill.billTotal.currency !== code) continue;
    const outstanding = computeBillOutstanding(bill);
    if (isZeroMoney(outstanding) || !isPositiveMoney(outstanding)) continue;

    const daysPastDue = bill.dueDate ? daysBetween(bill.dueDate, asOf) : null;
    const key = bucketForDaysPastDue(daysPastDue);
    totals.set(key, addMoney(totals.get(key)!, outstanding));
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalOutstanding = addMoney(totalOutstanding, outstanding);
  }

  return {
    currency: code,
    asOf,
    buckets: keys.map((key) => ({
      key,
      total: totals.get(key)!,
      count: counts.get(key) ?? 0,
    })),
    totalOutstanding,
    note: 'Aging uses AP Outstanding (bill − payments − credits). Payments are cash only; credits reduce outstanding and Actual. Foreign-currency bills are excluded.',
  };
}
