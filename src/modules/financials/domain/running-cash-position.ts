/**
 * Running cash position over an existing cash forecast.
 *
 * Walks dated buckets only: overdue, next_7, next_30, next_60, next_90.
 * Later and undated items are counted and summed for display, and are not
 * applied to the running balance. Does not query AR/AP.
 */

import type { BusinessDate } from '@/shared/dates';
import {
  addMoney,
  minMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { CashFlowBucketKey } from './cash-flow';
import { bucketForForecastItem, type CashFlowForecastItem } from './cash-flow-forecast';

export const RUNNING_CASH_WALK_BUCKETS = [
  'overdue',
  'next_7',
  'next_30',
  'next_60',
  'next_90',
] as const satisfies readonly CashFlowBucketKey[];

export type RunningCashWalkBucket = (typeof RUNNING_CASH_WALK_BUCKETS)[number];

export interface RunningCashStep {
  readonly key: RunningCashWalkBucket;
  readonly inflow: MoneyValue;
  readonly outflow: MoneyValue;
  readonly running: MoneyValue;
}

export interface CashRunningPosition {
  readonly opening: MoneyValue;
  readonly expectedIn: MoneyValue;
  readonly expectedOut: MoneyValue;
  readonly endBalance: MoneyValue;
  readonly lowestBalance: MoneyValue;
  readonly steps: readonly RunningCashStep[];
  readonly excludedLaterIn: MoneyValue;
  readonly excludedLaterOut: MoneyValue;
  readonly excludedUndatedIn: MoneyValue;
  readonly excludedUndatedOut: MoneyValue;
  readonly excludedLaterCount: number;
  readonly excludedUndatedCount: number;
}

type ForecastCashItem = Pick<CashFlowForecastItem, 'amount' | 'dueDate' | 'direction'>;

interface BucketTotals {
  inflow: MoneyValue;
  outflow: MoneyValue;
  count: number;
}

function emptyBucket(currency: string): BucketTotals {
  return { inflow: zeroMoney(currency), outflow: zeroMoney(currency), count: 0 };
}

/**
 * opening + dated inflows − dated outflows, in walk-bucket order.
 * Lowest balance includes the opening position before any movement.
 */
export function buildRunningCashPosition(input: {
  readonly opening: MoneyValue;
  readonly asOf: BusinessDate;
  readonly items: readonly ForecastCashItem[];
}): CashRunningPosition {
  const currency = input.opening.currency;
  const totals = new Map<CashFlowBucketKey, BucketTotals>();
  for (const key of [
    ...RUNNING_CASH_WALK_BUCKETS,
    'later',
    'undated',
  ] as const) {
    totals.set(key, emptyBucket(currency));
  }

  for (const item of input.items) {
    if (item.amount.currency !== currency) continue;
    const key = bucketForForecastItem(item, input.asOf);
    const bucket = totals.get(key);
    if (!bucket) continue;
    if (item.direction === 'in') {
      bucket.inflow = addMoney(bucket.inflow, item.amount);
    } else {
      bucket.outflow = addMoney(bucket.outflow, item.amount);
    }
    bucket.count += 1;
  }

  let running = input.opening;
  let lowest = input.opening;
  let expectedIn = zeroMoney(currency);
  let expectedOut = zeroMoney(currency);
  const steps: RunningCashStep[] = [];

  for (const key of RUNNING_CASH_WALK_BUCKETS) {
    const bucket = totals.get(key) ?? emptyBucket(currency);
    running = subtractMoney(addMoney(running, bucket.inflow), bucket.outflow);
    lowest = minMoney(lowest, running);
    expectedIn = addMoney(expectedIn, bucket.inflow);
    expectedOut = addMoney(expectedOut, bucket.outflow);
    steps.push({
      key,
      inflow: bucket.inflow,
      outflow: bucket.outflow,
      running,
    });
  }

  const later = totals.get('later') ?? emptyBucket(currency);
  const undated = totals.get('undated') ?? emptyBucket(currency);

  return {
    opening: input.opening,
    expectedIn,
    expectedOut,
    endBalance: running,
    lowestBalance: lowest,
    steps,
    excludedLaterIn: later.inflow,
    excludedLaterOut: later.outflow,
    excludedUndatedIn: undated.inflow,
    excludedUndatedOut: undated.outflow,
    excludedLaterCount: later.count,
    excludedUndatedCount: undated.count,
  };
}
