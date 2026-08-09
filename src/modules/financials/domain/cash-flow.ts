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

export type CashFlowBucketKey = 'overdue' | 'next_7' | 'next_30' | 'later' | 'undated';

export interface CashFlowBucket {
  readonly key: CashFlowBucketKey;
  /** Forecast expected incoming from Outstanding due dates — not Paid. */
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
 * Outgoing coverage. When open AP bills with due dates exist, forecast expected
 * payments. Expenses alone never invent AP. Matched/void/draft bills excluded.
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
  /** Forecast expected outgoing from open AP bill due dates — not Expense actual. */
  readonly expectedOut: MoneyValue;
  readonly count: number;
}

export interface CashFlowOutlook {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly horizonEnd: BusinessDate;
  /** Paid collected in [actual.rangeStart, actual.rangeEnd] — Actual, not Forecast. */
  readonly actual: CashFlowActualCollected;
  /** Expected incoming from Outstanding due dates — Forecast, not Paid. */
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
  'Outgoing cash is not forecast here: no open AP bills with due dates are in scope. Finalized expenses alone are cost records — AP invoices are not invented from expenses.';

export const OUTGOING_AP_FORECAST_NOTE =
  'Forecast outgoing — open AP bills by due date. Not Expense actual cost. Draft/void/matched bills excluded.';

export interface ApBillCashInput {
  readonly status: string;
  readonly dueDate: BusinessDate | null;
  /**
   * Amount expected to leave cash for this bill. For partial matches this must
   * be the unmatched remainder — never the full bill total (avoids double-count
   * vs already-matched portions / linked expenses).
   */
  readonly totalAmount: MoneyValue;
}

/**
 * Expected outgoing from open / partially_matched AP bills with due dates.
 * Never treats AP bill totals as Expense actuals.
 */
export function computeOutgoingCashOutlook(
  bills: readonly ApBillCashInput[],
  currency: string,
  asOf: BusinessDate,
): CashFlowOutgoingCoverage {
  const horizonEnd = addDays(asOf, 30);
  const weekEnd = addDays(asOf, 7);
  const keys: CashFlowBucketKey[] = ['overdue', 'next_7', 'next_30', 'later', 'undated'];
  const totals = new Map<CashFlowBucketKey, MoneyValue>();
  const counts = new Map<CashFlowBucketKey, number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  let any = false;
  for (const bill of bills) {
    if (bill.status !== 'open' && bill.status !== 'partially_matched') continue;
    if (bill.totalAmount.currency !== currency) continue;
    if (!isPositiveMoney(bill.totalAmount)) continue;

    any = true;
    let key: CashFlowBucketKey;
    if (!bill.dueDate) {
      key = 'undated';
    } else if (compareBusinessDates(bill.dueDate, asOf) < 0) {
      key = 'overdue';
    } else if (compareBusinessDates(bill.dueDate, weekEnd) <= 0) {
      key = 'next_7';
    } else if (compareBusinessDates(bill.dueDate, horizonEnd) <= 0) {
      key = 'next_30';
    } else {
      key = 'later';
    }

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
  'Forecast only — based on Outstanding billing due dates (credit notes net into undated). Not Paid. Undated Outstanding stays explicit. Does not invent collection precision.';

export const ACTUAL_NOTE =
  'Actual — Paid collected in the stated payment-date range. Not a Forecast.';

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
  const horizonEnd = addDays(asOf, 30);
  const keys: CashFlowBucketKey[] = ['overdue', 'next_7', 'next_30', 'later', 'undated'];
  const totals = new Map<CashFlowBucketKey, MoneyValue>();
  const counts = new Map<CashFlowBucketKey, number>();
  for (const key of keys) {
    totals.set(key, zeroMoney(currency));
    counts.set(key, 0);
  }

  const weekEnd = addDays(asOf, 7);

  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    if (isZeroMoney(record.outstandingAmount)) continue;

    if (!isPositiveMoney(record.outstandingAmount)) {
      totals.set('undated', addMoney(totals.get('undated')!, record.outstandingAmount));
      counts.set('undated', (counts.get('undated') ?? 0) + 1);
      continue;
    }

    let key: CashFlowBucketKey;
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
