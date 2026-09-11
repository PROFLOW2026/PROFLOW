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

export interface PaymentAmountInput {
  readonly amount: MoneyValue;
  readonly status: 'recorded' | 'void';
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

export function sumNetPaidAmountsForRecord(
  record: BillingAmountInput,
  payments: readonly PaymentAmountInput[],
  currency: string,
): MoneyValue {
  const paidGross = sumPaidAmountsForRecord(record.status, payments, currency);
  if (record.status === 'void' || record.status === 'draft') {
    return zeroMoney(currency);
  }
  return multiplyMoney(paidGross, billingNetToGrossRatio(record));
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
  const grossAmount = resolveBillingGrossAmount({ totalAmount, subtotalAmount, taxAmount });
  const invoiced = signedBillingAmount({
    kind,
    status,
    totalAmount: grossAmount,
    subtotalAmount,
    taxAmount,
  });
  if (invoiced === null) return money('0', totalAmount.currency);
  const held =
    kind !== 'credit_note' &&
    retentionHeldRemaining &&
    retentionHeldRemaining.currency === totalAmount.currency
      ? retentionHeldRemaining
      : money('0', totalAmount.currency);
  return subtractMoney(subtractMoney(invoiced, paidAmount), held);
}

export function recordNetOutstanding(
  record: BillingAmountInput & {
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
  },
  currency: string,
): MoneyValue {
  const signedNet = signedBillingNetAmount(record);
  if (signedNet === null) return zeroMoney(currency);
  const paidNet = sumNetPaidAmountsForRecord(record, record.payments, currency);
  const ratio = billingNetToGrossRatio(record);
  const heldNet =
    record.kind !== 'credit_note' &&
    record.retentionHeldRemaining &&
    !isZeroMoney(record.retentionHeldRemaining)
      ? multiplyMoney(record.retentionHeldRemaining, ratio)
      : zeroMoney(currency);
  return subtractMoney(subtractMoney(signedNet, paidNet), heldNet);
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
  const invoiced = sumInvoicedAmounts(records, currency);
  const netInvoiced = sumNetInvoicedAmounts(records, currency);
  const paid = sumMoney(
    records.map((record) => sumPaidAmountsForRecord(record.status, record.payments, currency)),
    currency,
  );
  const netPaid = sumMoney(
    records.map((record) => sumNetPaidAmountsForRecord(record, record.payments, currency)),
    currency,
  );
  const outstanding = sumMoney(
    records.map((record) => {
      const paidOnRecord = sumPaidAmountsForRecord(record.status, record.payments, currency);
      return recordOutstanding(
        record.totalAmount,
        paidOnRecord,
        record.kind,
        record.status,
        record.retentionHeldRemaining,
        record.taxAmount,
        record.subtotalAmount,
      );
    }),
    currency,
  );
  const netOutstanding = sumMoney(
    records.map((record) => recordNetOutstanding(record, currency)),
    currency,
  );
  return { invoiced, netInvoiced, paid, netPaid, outstanding, netOutstanding };
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
  if (records.length === 0) {
    const zero = zeroMoney(currency);
    return {
      invoiced: zero,
      netInvoiced: zero,
      paid: zero,
      netPaid: zero,
      outstanding: zero,
      netOutstanding: zero,
      hasBillingData: false,
      excludedForeignCurrencyRecordCount: 0,
    };
  }

  const matchingRecords = records.filter((record) => record.totalAmount.currency === currency);
  const excludedForeignCurrencyRecordCount = records.length - matchingRecords.length;
  const position = aggregateBillingPosition(matchingRecords, currency);

  return {
    ...position,
    hasBillingData: matchingRecords.some(
      (record) => record.status !== 'draft' && record.status !== 'void',
    ),
    excludedForeignCurrencyRecordCount,
  };
}
