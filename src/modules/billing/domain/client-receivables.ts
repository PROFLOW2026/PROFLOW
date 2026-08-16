import type { BusinessDate } from '@/shared/dates';
import { addMoney, isPositiveMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { aggregateBillingPositionInCurrency } from './outstanding';
import { computeReceivablesSummary } from './receivables-summary';
import type { BillingRecordSummary } from './types';

export interface ClientReceivablesSnapshot {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly invoiced: MoneyValue;
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
  readonly overdue: MoneyValue;
  readonly overdueCount: number;
  readonly heldRetention: MoneyValue | null;
  readonly excludedForeignCurrencyCount: number;
  readonly hasBillingData: boolean;
  readonly note: string;
}

function toPositionRecord(record: BillingRecordSummary) {
  return {
    kind: record.kind,
    status: record.status,
    totalAmount: record.totalAmount,
    payments: [{ amount: record.paidAmount, status: 'recorded' as const }],
    retentionHeldRemaining: record.retentionHeldRemaining,
  };
}

/** Held remaining on finalized AR (not credit notes). Null when nothing is held. */
function sumHeldRetention(
  records: readonly BillingRecordSummary[],
  currency: string,
): MoneyValue | null {
  let total = zeroMoney(currency);
  let any = false;
  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    if (record.status !== 'finalized') continue;
    if (record.kind === 'credit_note') continue;
    const held = record.retentionHeldRemaining;
    if (!held || !isPositiveMoney(held)) continue;
    total = addMoney(total, held);
    any = true;
  }
  return any ? total : null;
}

/**
 * Client AR snapshot from billing summaries in one currency.
 * Composes outstanding.ts + receivables-summary - not a second calculator.
 * Profit is omitted: project-level profit must not be summed across jobs.
 */
export function computeClientReceivablesSnapshot(
  records: readonly BillingRecordSummary[],
  currency: string,
  asOf: BusinessDate,
): ClientReceivablesSnapshot {
  const position = aggregateBillingPositionInCurrency(records.map(toPositionRecord), currency);
  const receivables = computeReceivablesSummary(records, currency, asOf);

  return {
    currency,
    asOf,
    invoiced: position.invoiced,
    paid: position.paid,
    outstanding: position.outstanding,
    overdue: receivables.overdueTotal,
    overdueCount: receivables.overdueCount,
    heldRetention: sumHeldRetention(records, currency),
    excludedForeignCurrencyCount: position.excludedForeignCurrencyRecordCount,
    hasBillingData: position.hasBillingData,
    note: receivables.note,
  };
}
