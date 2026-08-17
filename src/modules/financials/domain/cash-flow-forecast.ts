/**
 * Cash flow forecast 2.0 - drilldown items with certainty.
 *
 * Never invents a due date. Never invents future cash.
 * Billing ≠ Payment. Commitment ≠ Actual. Recurring drafts stay labelled Forecast.
 */

import type { BusinessDate } from '@/shared/dates';
import {
  addMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  assignCashFlowBucket,
  CASH_FLOW_BUCKET_KEYS,
  type CashFlowBucketKey,
  type CashFlowOutlook,
} from './cash-flow';

export type CashFlowCertainty = 'confirmed' | 'expected' | 'uncertain';
export type CashFlowDirection = 'in' | 'out';

export type CashFlowSourceType =
  | 'client_outstanding'
  | 'issued_billing'
  | 'expected_progress_billing'
  | 'retention_release_in'
  | 'vendor_bill'
  | 'commitment'
  | 'subcontractor_liability'
  | 'recurring_draft'
  | 'retention_release_out';

export interface CashFlowForecastItem {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly amount: MoneyValue;
  readonly dueDate: BusinessDate | null;
  readonly certainty: CashFlowCertainty;
  readonly direction: CashFlowDirection;
  readonly sourceType: CashFlowSourceType;
  readonly projectId?: string | null;
}

export interface CashFlowForecastPeriod {
  readonly key: CashFlowBucketKey;
  readonly expectedIn: MoneyValue;
  readonly expectedOut: MoneyValue;
  readonly inCount: number;
  readonly outCount: number;
}

export interface CashFlowCertaintyTotals {
  readonly confirmed: MoneyValue;
  readonly expected: MoneyValue;
  readonly uncertain: MoneyValue;
}

export interface CashFlowForecast {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly horizonEnd: BusinessDate;
  /** Existing outlook kept compatible for reports that still consume CashFlowOutlook. */
  readonly outlook: CashFlowOutlook;
  readonly items: readonly CashFlowForecastItem[];
  readonly periods: readonly CashFlowForecastPeriod[];
  readonly incomingByCertainty: CashFlowCertaintyTotals;
  readonly outgoingByCertainty: CashFlowCertaintyTotals;
  readonly showInflows: boolean;
  readonly showOutflows: boolean;
  readonly note: string;
}

export const FORECAST_V2_NOTE =
  'Forecast cash only. Dated items use recorded due dates. Missing dates stay undated. Recurring drafts are labelled Forecast and are not posted. Not Paid. Not Actual Cost.';

export function certaintyForDatedSource(input: {
  readonly dueDate: BusinessDate | null;
  readonly recorded: boolean;
}): CashFlowCertainty {
  if (!input.dueDate) return 'uncertain';
  return input.recorded ? 'confirmed' : 'expected';
}

/**
 * Assigns the recorded due date into a bucket. Null stays undated.
 */
export function bucketForForecastItem(
  item: Pick<CashFlowForecastItem, 'dueDate'>,
  asOf: BusinessDate,
): CashFlowBucketKey {
  return assignCashFlowBucket(item.dueDate, asOf);
}

function emptyCertainty(currency: string): CashFlowCertaintyTotals {
  const zero = zeroMoney(currency);
  return { confirmed: zero, expected: zero, uncertain: zero };
}

function addCertainty(
  totals: CashFlowCertaintyTotals,
  certainty: CashFlowCertainty,
  amount: MoneyValue,
): CashFlowCertaintyTotals {
  if (certainty === 'confirmed') {
    return { ...totals, confirmed: addMoney(totals.confirmed, amount) };
  }
  if (certainty === 'expected') {
    return { ...totals, expected: addMoney(totals.expected, amount) };
  }
  return { ...totals, uncertain: addMoney(totals.uncertain, amount) };
}

export function buildCashFlowForecast(input: {
  readonly outlook: CashFlowOutlook;
  readonly items: readonly CashFlowForecastItem[];
  readonly showInflows: boolean;
  readonly showOutflows: boolean;
}): CashFlowForecast {
  const { outlook, showInflows, showOutflows } = input;
  const currency = outlook.currency;
  const asOf = outlook.asOf;

  const visible = input.items.filter((item) => {
    if (item.amount.currency !== currency) return false;
    if (isZeroMoney(item.amount)) return false;
    if (item.direction === 'in' && !showInflows) return false;
    if (item.direction === 'out' && !showOutflows) return false;
    return true;
  });

  const inTotals = new Map<CashFlowBucketKey, MoneyValue>();
  const outTotals = new Map<CashFlowBucketKey, MoneyValue>();
  const inCounts = new Map<CashFlowBucketKey, number>();
  const outCounts = new Map<CashFlowBucketKey, number>();
  for (const key of CASH_FLOW_BUCKET_KEYS) {
    inTotals.set(key, zeroMoney(currency));
    outTotals.set(key, zeroMoney(currency));
    inCounts.set(key, 0);
    outCounts.set(key, 0);
  }

  let incomingByCertainty = emptyCertainty(currency);
  let outgoingByCertainty = emptyCertainty(currency);

  for (const item of visible) {
    const key = bucketForForecastItem(item, asOf);
    if (item.direction === 'in') {
      inTotals.set(key, addMoney(inTotals.get(key)!, item.amount));
      inCounts.set(key, (inCounts.get(key) ?? 0) + 1);
      incomingByCertainty = addCertainty(incomingByCertainty, item.certainty, item.amount);
    } else {
      outTotals.set(key, addMoney(outTotals.get(key)!, item.amount));
      outCounts.set(key, (outCounts.get(key) ?? 0) + 1);
      outgoingByCertainty = addCertainty(outgoingByCertainty, item.certainty, item.amount);
    }
  }

  const periods: CashFlowForecastPeriod[] = CASH_FLOW_BUCKET_KEYS.map((key) => ({
    key,
    expectedIn: inTotals.get(key)!,
    expectedOut: outTotals.get(key)!,
    inCount: inCounts.get(key) ?? 0,
    outCount: outCounts.get(key) ?? 0,
  }));

  return {
    currency,
    asOf,
    horizonEnd: outlook.horizonEnd,
    outlook,
    items: visible,
    periods,
    incomingByCertainty,
    outgoingByCertainty,
    showInflows,
    showOutflows,
    note: FORECAST_V2_NOTE,
  };
}

export function sumPeriodDirection(
  periods: readonly CashFlowForecastPeriod[],
  direction: CashFlowDirection,
  keys: readonly CashFlowBucketKey[] = CASH_FLOW_BUCKET_KEYS,
): MoneyValue {
  const currency = periods[0]?.expectedIn.currency ?? 'ILS';
  let total = zeroMoney(currency);
  const allowed = new Set(keys);
  for (const period of periods) {
    if (!allowed.has(period.key)) continue;
    total = addMoney(total, direction === 'in' ? period.expectedIn : period.expectedOut);
  }
  return total;
}
