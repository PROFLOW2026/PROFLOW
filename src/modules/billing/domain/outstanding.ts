import { compareBusinessDates, isBefore, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  compareMoney,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  multiplyMoney,
  negateMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import { zeroMoney } from '@/shared/money';
import type { BillingKind, BillingRecordStatus, CollectionStatus } from './types';
import {
  aggregateRevenuePosition,
  aggregateRevenuePositionInCurrency,
  computeRecordRevenuePosition,
  deriveCollectionStatusFromOpen,
  sumPaymentTripletsForRecord,
  type BillingRecordRevenueInput,
  type PaymentAmountInput,
  type PaymentAmountBasis,
} from './revenue-position';

export type { PaymentAmountInput, PaymentAmountBasis };

export interface BillingAmountInput {
  readonly kind: BillingKind;
  readonly status: BillingRecordStatus;
  readonly totalAmount: MoneyValue;
  readonly subtotalAmount?: MoneyValue;
  readonly taxAmount?: MoneyValue | null;
}

/** Document GROSS: subtotal + stored tax when present; otherwise totalAmount. */
export function resolveBillingGrossAmount(
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): MoneyValue {
  const subtotal = input.subtotalAmount ?? input.totalAmount;
  if (input.taxAmount && !isZeroMoney(input.taxAmount)) {
    return addMoney(subtotal, input.taxAmount);
  }
  return input.totalAmount;
}

/** NET share of a gross cash amount on this billing record (0–1; 1 when no VAT split). */
export function billingNetToGrossRatio(
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): ReturnType<typeof toDecimalValue> {
  const gross = resolveBillingGrossAmount(input);
  const net = input.subtotalAmount ?? input.totalAmount;
  if (isZeroMoney(gross)) {
    return toDecimalValue(money('1', net.currency));
  }
  return toDecimalValue(net).dividedBy(toDecimalValue(gross));
}

/** Credit notes reduce invoiced; other kinds add to it. Uses document GROSS. */
export function signedBillingAmount(input: BillingAmountInput): MoneyValue | null {
  if (input.status === 'void' || input.status === 'draft') return null;
  const gross = resolveBillingGrossAmount(input);
  if (input.kind === 'credit_note') return negateMoney(gross);
  return gross;
}

/** Net ex-VAT signed amount — pairs with contract CCV for backlog math. */
export function signedBillingNetAmount(
  input: BillingAmountInput & { readonly subtotalAmount?: MoneyValue },
): MoneyValue | null {
  if (input.status === 'void' || input.status === 'draft') return null;
  const net = input.subtotalAmount ?? input.totalAmount;
  if (input.kind === 'credit_note') return negateMoney(net);
  return net;
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

export function sumNetInvoicedAmounts(
  records: readonly (BillingAmountInput & { readonly subtotalAmount?: MoneyValue })[],
  currency: string,
): MoneyValue {
  const signed = records
    .map((record) => signedBillingNetAmount(record))
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

/** @deprecated Use sumPaymentTripletsForRecord from revenue-position. */
export function sumNetPaidAmountsForRecord(
  record: BillingAmountInput,
  payments: readonly PaymentAmountInput[],
  currency: string,
): MoneyValue {
  return sumPaymentTripletsForRecord(record, payments, currency).net;
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
  retentionHeldRemaining?: MoneyValue,
  taxAmount?: MoneyValue | null,
  subtotalAmount?: MoneyValue,
): MoneyValue {
  const record: BillingRecordRevenueInput = {
    kind,
    status,
    totalAmount,
    subtotalAmount,
    taxAmount,
    payments: [{ amount: paidAmount, amountBasis: 'gross', status: 'recorded' }],
    retentionHeldRemaining,
  };
  const position = computeRecordRevenuePosition(record, totalAmount.currency);
  if (!position) return money('0', totalAmount.currency);
  return position.open.gross;
}

export function recordNetOutstanding(
  record: BillingAmountInput & {
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
  },
  currency: string,
): MoneyValue {
  const position = computeRecordRevenuePosition(record, currency);
  if (!position) return zeroMoney(currency);
  return position.open.net;
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
  records: readonly (BillingAmountInput & {
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
    readonly subtotalAmount?: MoneyValue;
  })[],
  currency: string,
): {
  invoiced: MoneyValue;
  netInvoiced: MoneyValue;
  paid: MoneyValue;
  netPaid: MoneyValue;
  outstanding: MoneyValue;
  netOutstanding: MoneyValue;
} {
  const position = aggregateRevenuePosition(records, currency);
  return {
    invoiced: position.billed.gross,
    netInvoiced: position.billed.net,
    paid: position.paid.gross,
    netPaid: position.paid.net,
    outstanding: position.open.gross,
    netOutstanding: position.open.net,
  };
}

export function aggregateBillingPositionInCurrency(
  records: readonly (BillingAmountInput & {
    readonly totalAmount: MoneyValue;
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
    readonly subtotalAmount?: MoneyValue;
  })[],
  currency: string,
): {
  invoiced: MoneyValue;
  netInvoiced: MoneyValue;
  paid: MoneyValue;
  netPaid: MoneyValue;
  outstanding: MoneyValue;
  netOutstanding: MoneyValue;
  hasBillingData: boolean;
  excludedForeignCurrencyRecordCount: number;
} {
  const result = aggregateRevenuePositionInCurrency(records, currency);
  return {
    invoiced: result.billed.gross,
    netInvoiced: result.billed.net,
    paid: result.paid.gross,
    netPaid: result.paid.net,
    outstanding: result.open.gross,
    netOutstanding: result.open.net,
    hasBillingData: result.hasBillingData,
    excludedForeignCurrencyRecordCount: result.excludedForeignCurrencyRecordCount,
  };
}

export {
  aggregateRevenuePosition,
  aggregateRevenuePositionInCurrency,
  computeRecordRevenuePosition,
  deriveCollectionStatusFromOpen,
  sumPaymentTripletsForRecord,
} from './revenue-position';
