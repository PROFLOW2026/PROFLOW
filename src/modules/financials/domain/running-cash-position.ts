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
  isZeroMoney,
  minMoney,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { CashFlowBucketKey } from './cash-flow';
import {
  bucketForForecastItem,
  type CashFlowForecastItem,
  type CashFlowSourceType,
} from './cash-flow-forecast';

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

export interface CashForecastSourceSlice {
  readonly sourceType: CashFlowSourceType;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
}

const FORECAST_SOURCE_ORDER = [
  'client_outstanding',
  'issued_billing',
  'expected_progress_billing',
  'retention_release_in',
  'certified_subcontract_receipt',
  'vendor_bill',
  'commitment',
  'subcontractor_liability',
  'recurring_draft',
  'retention_release_out',
  'operating_expense',
  'payroll_obligation',
] as const satisfies readonly CashFlowSourceType[];

export interface CashRunningPosition {
  readonly opening: MoneyValue;
  /** Walk-horizon inflows by source. Lines sum to expectedIn. */
  readonly inflowSources: readonly CashForecastSourceSlice[];
  /** Walk-horizon outflows by source. Net lines sum to expectedOutNet. */
  readonly outflowSources: readonly CashForecastSourceSlice[];
  readonly expectedIn: MoneyValue;
  /** Gross of walk inflows when items carry grossAmount. Equals expectedIn when they do not. */
  readonly expectedInGross: MoneyValue;
  readonly expectedOut: MoneyValue;
  /** Ex-VAT walk outflows when items carry netAmount. Equals expectedOut when they do not. */
  readonly expectedOutNet: MoneyValue;
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

type ForecastCashItem = Pick<
  CashFlowForecastItem,
  'amount' | 'dueDate' | 'direction' | 'grossAmount' | 'netAmount'
> & {
  readonly sourceType?: CashFlowSourceType;
};

interface BucketTotals {
  inflow: MoneyValue;
  inflowGross: MoneyValue;
  outflow: MoneyValue;
  outflowNet: MoneyValue;
  count: number;
}

function sourceSlices(
  bySource: ReadonlyMap<CashFlowSourceType, { net: MoneyValue; gross: MoneyValue }>,
): CashForecastSourceSlice[] {
  const slices: CashForecastSourceSlice[] = [];
  for (const sourceType of FORECAST_SOURCE_ORDER) {
    const row = bySource.get(sourceType);
    if (!row || (isZeroMoney(row.net) && isZeroMoney(row.gross))) continue;
    slices.push({
      sourceType,
      net: roundMoney(row.net),
      gross: roundMoney(row.gross),
    });
  }
  return slices;
}

function emptyBucket(currency: string): BucketTotals {
  return {
    inflow: zeroMoney(currency),
    inflowGross: zeroMoney(currency),
    outflow: zeroMoney(currency),
    outflowNet: zeroMoney(currency),
    count: 0,
  };
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
  const walkBuckets = new Set<CashFlowBucketKey>(RUNNING_CASH_WALK_BUCKETS);
  const inflowBySource = new Map<CashFlowSourceType, { net: MoneyValue; gross: MoneyValue }>();
  const outflowBySource = new Map<CashFlowSourceType, { net: MoneyValue; gross: MoneyValue }>();
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
      bucket.inflowGross = addMoney(bucket.inflowGross, item.grossAmount ?? item.amount);
    } else {
      bucket.outflow = addMoney(bucket.outflow, item.amount);
      bucket.outflowNet = addMoney(bucket.outflowNet, item.netAmount ?? item.amount);
    }
    if (item.sourceType && walkBuckets.has(key)) {
      const target = item.direction === 'in' ? inflowBySource : outflowBySource;
      const current = target.get(item.sourceType) ?? {
        net: zeroMoney(currency),
        gross: zeroMoney(currency),
      };
      target.set(item.sourceType, {
        net: addMoney(current.net, item.direction === 'in' ? item.amount : (item.netAmount ?? item.amount)),
        gross: addMoney(
          current.gross,
          item.direction === 'in' ? (item.grossAmount ?? item.amount) : item.amount,
        ),
      });
    }
    bucket.count += 1;
  }

  let running = input.opening;
  let lowest = input.opening;
  let expectedIn = zeroMoney(currency);
  let expectedInGross = zeroMoney(currency);
  let expectedOut = zeroMoney(currency);
  let expectedOutNet = zeroMoney(currency);
  const steps: RunningCashStep[] = [];

  for (const key of RUNNING_CASH_WALK_BUCKETS) {
    const bucket = totals.get(key) ?? emptyBucket(currency);
    running = subtractMoney(addMoney(running, bucket.inflow), bucket.outflow);
    lowest = minMoney(lowest, running);
    expectedIn = addMoney(expectedIn, bucket.inflow);
    expectedInGross = addMoney(expectedInGross, bucket.inflowGross);
    expectedOut = addMoney(expectedOut, bucket.outflow);
    expectedOutNet = addMoney(expectedOutNet, bucket.outflowNet);
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
    inflowSources: sourceSlices(inflowBySource),
    outflowSources: sourceSlices(outflowBySource),
    expectedIn,
    expectedInGross,
    expectedOut,
    expectedOutNet,
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
