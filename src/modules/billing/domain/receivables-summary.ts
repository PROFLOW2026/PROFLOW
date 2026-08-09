import type { BusinessDate } from '@/shared/dates';
import { addMoney, isPositiveMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { BillingRecordSummary } from './types';

export interface ReceivablesSummary {
  readonly currency: string;
  readonly asOf: BusinessDate;
  readonly totalOutstanding: MoneyValue;
  readonly overdueTotal: MoneyValue;
  readonly openCount: number;
  readonly partialPaidCount: number;
  readonly overdueCount: number;
  /**
   * Outstanding on finalized `retention_release` billing only.
   * Null when the org has no such open amounts in base currency — do not invent holdback accounting.
   */
  readonly retentionReleaseOutstanding: MoneyValue | null;
  readonly retentionReleaseOpenCount: number;
  readonly excludedForeignCurrencyCount: number;
  readonly note: string;
}

/**
 * Org-level AR snapshot from BillingRecord summaries.
 * Outstanding is derived; draft/void excluded via collectionStatus; credit notes already reduce invoiced.
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
      if (record.status === 'finalized' && isPositiveMoney(record.outstandingAmount)) {
        excludedForeignCurrencyCount += 1;
      }
      continue;
    }

    if (record.collectionStatus === 'open') openCount += 1;
    if (record.collectionStatus === 'partial') partialPaidCount += 1;
    if (record.collectionStatus === 'overdue') overdueCount += 1;

    if (!isPositiveMoney(record.outstandingAmount)) continue;

    totalOutstanding = addMoney(totalOutstanding, record.outstandingAmount);

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
    retentionReleaseOutstanding:
      retentionReleaseOpenCount > 0 ? retentionReleaseOutstanding : null,
    retentionReleaseOpenCount,
    excludedForeignCurrencyCount,
    note: 'Outstanding is derived (Invoiced − Paid). Credit notes reduce Invoiced; voided records and voided payments are excluded. VAT is not profit or revenue.',
  };
}
