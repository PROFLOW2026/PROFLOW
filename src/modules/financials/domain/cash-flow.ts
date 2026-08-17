import type { BusinessDate } from '@/shared/dates';
import { addDays, compareBusinessDates, startOfMonth } from '@/shared/dates';
import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';

export type CashFlowBucketKey =
  | 'overdue'
  | 'next_7'
  | 'next_30'
  | 'next_60'
  | 'next_90'
  | 'later'
  | 'undated';

export const CASH_FLOW_BUCKET_KEYS: readonly CashFlowBucketKey[] = [
  'overdue',
  'next_7',
  'next_30',
  'next_60',
  'next_90',
  'later',
  'undated',
];

/** Timed forecast horizon in days. Overdue and undated sit outside this window. */
export const CASH_FLOW_HORIZON_DAYS = 90;

/**
 * Bucket from a recorded due date. Missing dates stay `undated` - never invented.
 */
export function assignCashFlowBucket(
  dueDate: BusinessDate | null,
  asOf: BusinessDate,
): CashFlowBucketKey {
  if (!dueDate) return 'undated';
  if (compareBusinessDates(dueDate, asOf) < 0) return 'overdue';
  if (compareBusinessDates(dueDate, addDays(asOf, 7)) <= 0) return 'next_7';
  if (compareBusinessDates(dueDate, addDays(asOf, 30)) <= 0) return 'next_30';
  if (compareBusinessDates(dueDate, addDays(asOf, 60)) <= 0) return 'next_60';
  if (compareBusinessDates(dueDate, addDays(asOf, CASH_FLOW_HORIZON_DAYS)) <= 0) return 'next_90';
  return 'later';
}

export interface CashFlowBucket {
  readonly key: CashFlowBucketKey;
  /** Forecast expected incoming from Outstanding due dates - not Paid. */
  readonly expectedIn: MoneyValue;
  readonly count: number;
}

/** Actual Paid collected in an explicit date range (payment dates). */
export interface CashFlowActualCollected {
  readonly kind: 'actual';
  readonly rangeStart: BusinessDate;
  readonly rangeEnd: BusinessDate;
  readonly collected: MoneyValue;
  readonly count: number;
}

/**
 * Outgoing coverage. When recognized AP bills with cash outstanding exist,
 * forecast expected payments. Expenses alone never invent AP.
 * Draft/void and fully paid (zero outstanding) bills excluded.
 * Amounts must already be cash outstanding (bill − active vendor payments).
 */
export type CashFlowOutgoingCoverage =
  | {
      readonly available: false;
      readonly disclosureKey: 'no_ap_due_dates' | 'no_open_ap_bills';
    }
  | {
      readonly available: true;
      readonly forecastBuckets: readonly CashFlowOutgoingBucket[];
    };

export interface CashFlowOutgoingBucket {
  readonly key: CashFlowBucketKey;
  /** Forecast expected outgoing from open AP bill due dates - not Expense actual. */
  readonly expectedOut: MoneyValue;
  readonly count: number;
}

export interface CashFlowOutlook {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly horizonEnd: BusinessDate;
  /** Paid collected in [actual.rangeStart, actual.rangeEnd] - Actual, not Forecast. */
  readonly actual: CashFlowActualCollected;
  /** Expected incoming from Outstanding due dates - Forecast, not Paid. */
  readonly forecastBuckets: readonly CashFlowBucket[];
  /**
   * @deprecated Prefer `forecastBuckets`. Kept as an alias for call sites that
   * still read `buckets` as the forecast horizon.
   */
  readonly buckets: readonly CashFlowBucket[];
  readonly outgoing: CashFlowOutgoingCoverage;
  readonly note: string;
}

export interface CollectedPaymentInput {
  readonly amount: MoneyValue;
  readonly paymentDate: BusinessDate;
  readonly status: 'recorded' | 'void';
}

export const OUTGOING_NO_AP_DISCLOSURE =
  'Outgoing cash is not forecast here: no open AP bills with due dates are in scope. Finalized expenses alone are cost records - AP invoices are not invented from expenses.';

export const OUTGOING_AP_FORECAST_NOTE =
  'Forecast outgoing - recognized AP bills by due date using cash outstanding after vendor payments. Not Expense actual cost. Draft/void and fully paid bills excluded.';

export interface ApBillCashInput {
  readonly status: string;
  readonly dueDate: BusinessDate | null;
  /**
   * Cash expected to leave for this bill: bill total − active (non-void) vendor
   * payment applications. Never PO-match remainder and never Actual Cost.
   */
  readonly totalAmount: MoneyValue;
  readonly id?: string;
  readonly reference?: string | null;
  readonly projectId?: string | null;
  readonly subcontractAgreementId?: string | null;
}

/**
 * Expected outgoing from recognized AP bills with positive cash outstanding.
 * Never treats AP bill totals as Expense actuals; payments reduce cash only.
 */
export function computeOutgoingCashOutlook(
  bills: readonly ApBillCashInput[],
  currency: string,
  asOf: BusinessDate,
): CashFlowOutgoingCoverage {
  const keys = CASH_FLOW_BUCKET_KEYS;
  const totals = new Map<CashFlowBucketKey, MoneyValue>();
  const counts = new Map<CashFlowBucketKey, number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  let any = false;
  for (const bill of bills) {
    if (
      bill.status !== 'open' &&
      bill.status !== 'partially_matched' &&
      bill.status !== 'matched'
    ) {
      continue;
    }
    if (bill.totalAmount.currency !== currency) continue;
    if (!isPositiveMoney(bill.totalAmount)) continue;

    any = true;
    const key = assignCashFlowBucket(bill.dueDate, asOf);
    totals.set(key, addMoney(totals.get(key)!, bill.totalAmount));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (!any) {
    return { available: false, disclosureKey: 'no_open_ap_bills' };
  }

  return {
    available: true,
    forecastBuckets: keys.map((key) => ({
      key,
      expectedOut: totals.get(key)!,
      count: counts.get(key) ?? 0,
    })),
  };
}

export const FORECAST_NOTE =
  'Forecast only - based on Outstanding billing due dates (credit notes net into undated). Not Paid. Undated Outstanding stays explicit. Does not invent collection precision.';

export const ACTUAL_NOTE =
  'Actual - Paid collected in the stated payment-date range. Not a Forecast.';

/**
 * Expected incoming cash from Outstanding billing with due dates.
 * Figures are Forecast collections, never Paid / Actual.
 * Credit notes (negative outstanding) net into `undated` so forecast matches net AR.
 */
export function computeIncomingCashOutlook(
  records: readonly BillingRecordSummary[],
  currency: string,
  asOf: BusinessDate,
): Pick<CashFlowOutlook, 'currency' | 'asOf' | 'horizonEnd' | 'forecastBuckets' | 'buckets' | 'note'> {
  const horizonEnd = addDays(asOf, CASH_FLOW_HORIZON_DAYS);
  const keys = CASH_FLOW_BUCKET_KEYS;
  const totals = new Map<CashFlowBucketKey, MoneyValue>();
  const counts = new Map<CashFlowBucketKey, number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    if (isZeroMoney(record.outstandingAmount)) continue;

    if (!isPositiveMoney(record.outstandingAmount)) {
      totals.set('undated', addMoney(totals.get('undated')!, record.outstandingAmount));
      counts.set('undated', (counts.get('undated') ?? 0) + 1);
      continue;
    }

    const key = assignCashFlowBucket(record.dueDate, asOf);
    totals.set(key, addMoney(totals.get(key)!, record.outstandingAmount));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const forecastBuckets = keys.map((key) => ({
    key,
    expectedIn: totals.get(key)!,
    count: counts.get(key) ?? 0,
  }));

  return {
    currency,
    asOf,
    horizonEnd,
    forecastBuckets,
    buckets: forecastBuckets,
    note: FORECAST_NOTE,
  };
}

/**
 * Actual Paid collected: sum of recorded payments whose paymentDate falls in
 * [rangeStart, rangeEnd] inclusive. Currencies never mixed.
 */
export function computeCollectedActual(
  payments: readonly CollectedPaymentInput[],
  currency: string,
  rangeStart: BusinessDate,
  rangeEnd: BusinessDate,
): CashFlowActualCollected {
  let collected = zeroMoney(currency);
  let count = 0;

  for (const payment of payments) {
    if (payment.status !== 'recorded') continue;
    if (payment.amount.currency !== currency) continue;
    if (compareBusinessDates(payment.paymentDate, rangeStart) < 0) continue;
    if (compareBusinessDates(payment.paymentDate, rangeEnd) > 0) continue;
    if (!isPositiveMoney(payment.amount)) continue;

    collected = addMoney(collected, payment.amount);
    count += 1;
  }

  return {
    kind: 'actual',
    rangeStart,
    rangeEnd,
    collected,
    count,
  };
}

/** Default Actual range: month-to-date ending on asOf. */
export function defaultActualCollectionRange(asOf: BusinessDate): {
  readonly rangeStart: BusinessDate;
  readonly rangeEnd: BusinessDate;
} {
  return { rangeStart: startOfMonth(asOf), rangeEnd: asOf };
}

export function buildCashFlowOutlook(input: {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly outstandingRecords: readonly BillingRecordSummary[];
  readonly payments: readonly CollectedPaymentInput[];
  readonly actualRangeStart?: BusinessDate;
  readonly actualRangeEnd?: BusinessDate;
  readonly openApBills?: readonly ApBillCashInput[];
}): CashFlowOutlook {
  const range = {
    rangeStart: input.actualRangeStart ?? defaultActualCollectionRange(input.asOf).rangeStart,
    rangeEnd: input.actualRangeEnd ?? defaultActualCollectionRange(input.asOf).rangeEnd,
  };

  const forecast = computeIncomingCashOutlook(
    input.outstandingRecords,
    input.currency,
    input.asOf,
  );

  const actual = computeCollectedActual(
    input.payments,
    input.currency,
    range.rangeStart,
    range.rangeEnd,
  );

  const outgoing =
    input.openApBills !== undefined
      ? computeOutgoingCashOutlook(input.openApBills, input.currency, input.asOf)
      : ({ available: false, disclosureKey: 'no_ap_due_dates' } as const);

  const outgoingNote =
    outgoing.available === false
      ? OUTGOING_NO_AP_DISCLOSURE
      : OUTGOING_AP_FORECAST_NOTE;

  return {
    currency: forecast.currency,
    asOf: forecast.asOf,
    horizonEnd: forecast.horizonEnd,
    actual,
    forecastBuckets: forecast.forecastBuckets,
    buckets: forecast.buckets,
    outgoing,
    note: `${ACTUAL_NOTE} ${FORECAST_NOTE} ${outgoingNote}`,
  };
}
