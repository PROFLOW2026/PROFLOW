import { compareBusinessDates, isBefore, type BusinessDate } from '@/shared/dates';
import {
  compareMoney,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  negateMoney,
  subtractMoney,
  sumMoney,
  type MoneyValue,
} from '@/shared/money';
import { zeroMoney } from '@/shared/money';
import type { BillingKind, BillingRecordStatus, CollectionStatus } from './types';

export interface BillingAmountInput {
  readonly kind: BillingKind;
  readonly status: BillingRecordStatus;
  readonly totalAmount: MoneyValue;
}

export interface PaymentAmountInput {
  readonly amount: MoneyValue;
  readonly status: 'recorded' | 'void';
}

/** Credit notes reduce invoiced; other kinds add to it. */
export function signedBillingAmount(input: BillingAmountInput): MoneyValue | null {
  if (input.status === 'void' || input.status === 'draft') return null;
  if (input.kind === 'credit_note') return negateMoney(input.totalAmount);
  return input.totalAmount;
}

export function sumInvoicedAmounts(
  records: readonly BillingAmountInput[],
  currency: string,
): MoneyValue {
  const signed = records
    .map((record) => signedBillingAmount(record))
    .filter((value): value is MoneyValue => value !== null);
  return sumMoney(signed, currency);
}

export function sumPaidAmounts(
  payments: readonly PaymentAmountInput[],
  currency: string,
): MoneyValue {
  const active = payments
    .filter((payment) => payment.status === 'recorded')
    .map((payment) => payment.amount);
  return sumMoney(active, currency);
}

export function sumPaidAmountsForRecord(
  recordStatus: BillingRecordStatus,
  payments: readonly PaymentAmountInput[],
  currency: string,
): MoneyValue {
  if (recordStatus === 'void' || recordStatus === 'draft') {
    return zeroMoney(currency);
  }
  return sumPaidAmounts(payments, currency);
}

export function computeOutstanding(invoiced: MoneyValue, paid: MoneyValue): MoneyValue {
  return subtractMoney(invoiced, paid);
}

export function deriveCollectionStatus(
  outstanding: MoneyValue,
  paid: MoneyValue,
  dueDate: BusinessDate | null,
  today: BusinessDate,
  recordStatus: BillingRecordStatus,
): CollectionStatus | null {
  if (recordStatus === 'draft' || recordStatus === 'void') return null;

  if (!isPositiveMoney(outstanding)) return 'paid';
  if (dueDate && isBefore(dueDate, today)) return 'overdue';
  if (isZeroMoney(paid)) return 'open';
  return 'partial';
}

export function matchesListFilter(
  filter: 'all' | 'paid' | 'outstanding' | 'overdue',
  collectionStatus: CollectionStatus | null,
): boolean {
  if (filter === 'all') return true;
  if (collectionStatus === null) return false;
  if (filter === 'paid') return collectionStatus === 'paid';
  if (filter === 'outstanding') return collectionStatus === 'open' || collectionStatus === 'partial';
  return collectionStatus === 'overdue';
}

export function recordOutstanding(
  totalAmount: MoneyValue,
  paidAmount: MoneyValue,
  kind: BillingKind,
  status: BillingRecordStatus,
): MoneyValue {
  const invoiced = signedBillingAmount({ kind, status, totalAmount });
  if (invoiced === null) return money('0', totalAmount.currency);
  return subtractMoney(invoiced, paidAmount);
}

export function isOverpaid(outstanding: MoneyValue): boolean {
  return isNegativeMoney(outstanding);
}

export function compareOutstanding(left: MoneyValue, right: MoneyValue): -1 | 0 | 1 {
  return compareMoney(left, right);
}

export function isOverdueOn(
  outstanding: MoneyValue,
  dueDate: BusinessDate | null,
  today: BusinessDate,
): boolean {
  if (!isPositiveMoney(outstanding)) return false;
  if (!dueDate) return false;
  return compareBusinessDates(dueDate, today) < 0;
}

export function aggregateBillingPosition(
  records: readonly (BillingAmountInput & { payments: readonly PaymentAmountInput[] })[],
  currency: string,
): { invoiced: MoneyValue; paid: MoneyValue; outstanding: MoneyValue } {
  const invoiced = sumInvoicedAmounts(records, currency);
  const paid = sumMoney(
    records.map((record) => sumPaidAmountsForRecord(record.status, record.payments, currency)),
    currency,
  );
  const outstanding = computeOutstanding(invoiced, paid);
  return { invoiced, paid, outstanding };
}

export function aggregateBillingPositionInCurrency(
  records: readonly (BillingAmountInput & {
    readonly totalAmount: MoneyValue;
    readonly payments: readonly PaymentAmountInput[];
  })[],
  currency: string,
): {
  invoiced: MoneyValue;
  paid: MoneyValue;
  outstanding: MoneyValue;
  hasBillingData: boolean;
  excludedForeignCurrencyRecordCount: number;
} {
  if (records.length === 0) {
    const zero = zeroMoney(currency);
    return {
      invoiced: zero,
      paid: zero,
      outstanding: zero,
      hasBillingData: false,
      excludedForeignCurrencyRecordCount: 0,
    };
  }

  const matchingRecords = records.filter((record) => record.totalAmount.currency === currency);
  const excludedForeignCurrencyRecordCount = records.length - matchingRecords.length;
  const position = aggregateBillingPosition(matchingRecords, currency);

  return {
    ...position,
    hasBillingData: matchingRecords.length > 0,
    excludedForeignCurrencyRecordCount,
  };
}
