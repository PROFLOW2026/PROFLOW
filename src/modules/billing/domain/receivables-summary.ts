import type { BusinessDate } from '@/shared/dates';
import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { BillingRecordSummary } from './types';

export interface ReceivablesSummary {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly totalOutstanding: MoneyValue;
  readonly overdueTotal: MoneyValue;
  readonly openCount: number;
  readonly partialPaidCount: number;
  readonly overdueCount: number;
  /** Held retention still reducing receivable-now (cash timing, not a second invoice). */
  readonly heldRetention: MoneyValue | null;
  /**
   * Outstanding on finalized `retention_release` billing only.
   * Null when the org has no such open amounts in base currency - do not invent holdback accounting.
   */
  readonly retentionReleaseOutstanding: MoneyValue | null;
  readonly retentionReleaseOpenCount: number;
  readonly excludedForeignCurrencyCount: number;
  readonly note: string;
}

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
 * Org-level AR snapshot from BillingRecord summaries.
 * Outstanding per record is receivable-now = signed invoiced − paid − held retention.
 * Draft/void are excluded via zero outstanding + null collectionStatus.
 */
export function computeReceivablesSummary(
  records: readonly BillingRecordSummary[],
  currency: string,
  asOf: BusinessDate,
): ReceivablesSummary {
  let totalOutstanding = zeroMoney(currency);
  let overdueTotal = zeroMoney(currency);
  let retentionReleaseOutstanding = zeroMoney(currency);
  let openCount = 0;
  let partialPaidCount = 0;
  let overdueCount = 0;
  let retentionReleaseOpenCount = 0;
  let excludedForeignCurrencyCount = 0;

  for (const record of records) {
    if (record.totalAmount.currency !== currency) {
      if (record.status === 'finalized' && !isZeroMoney(record.outstandingAmount)) {
        excludedForeignCurrencyCount += 1;
      }
      continue;
    }

    if (record.collectionStatus === 'open') openCount += 1;
    if (record.collectionStatus === 'partial') partialPaidCount += 1;
    if (record.collectionStatus === 'overdue') overdueCount += 1;

    // Net credit notes / overpayments into AR (signed outstanding), not only positives.
    if (!isZeroMoney(record.outstandingAmount)) {
      totalOutstanding = addMoney(totalOutstanding, record.outstandingAmount);
    }

    if (!isPositiveMoney(record.outstandingAmount)) continue;

    if (record.collectionStatus === 'overdue') {
      overdueTotal = addMoney(overdueTotal, record.outstandingAmount);
    }

    if (record.kind === 'retention_release' && record.status === 'finalized') {
      retentionReleaseOutstanding = addMoney(retentionReleaseOutstanding, record.outstandingAmount);
      retentionReleaseOpenCount += 1;
    }
  }

  return {
    currency,
    asOf,
    totalOutstanding,
    overdueTotal,
    openCount,
    partialPaidCount,
    overdueCount,
    heldRetention: sumHeldRetention(records, currency),
    retentionReleaseOutstanding:
      retentionReleaseOpenCount > 0 ? retentionReleaseOutstanding : null,
    retentionReleaseOpenCount,
    excludedForeignCurrencyCount,
    note: 'Outstanding (receivable now) = Invoiced − Paid − held retention. Credit notes reduce Outstanding; voided records and voided payments are excluded. VAT is not profit or revenue. Retention is cash timing, not a second invoice.',
  };
}
