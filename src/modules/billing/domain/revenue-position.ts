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
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { BillingRecordStatus, CollectionStatus } from './types';
import type { BillingAmountInput } from './outstanding';

function resolveBillingGrossAmount(
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): MoneyValue {
  const subtotal = input.subtotalAmount ?? input.totalAmount;
  if (input.taxAmount && !isZeroMoney(input.taxAmount)) {
    return addMoney(subtotal, input.taxAmount);
  }
  return input.totalAmount;
}

function billingNetToGrossRatio(
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): ReturnType<typeof toDecimalValue> {
  const gross = resolveBillingGrossAmount(input);
  const net = input.subtotalAmount ?? input.totalAmount;
  if (isZeroMoney(gross)) {
    return toDecimalValue(money('1', net.currency));
  }
  return toDecimalValue(net).dividedBy(toDecimalValue(gross));
}

export type PaymentAmountBasis = 'net' | 'gross';

export interface RevenueTriplet {
  readonly net: MoneyValue;
  readonly vat: MoneyValue;
  readonly gross: MoneyValue;
}

export interface RevenuePosition {
  readonly billed: RevenueTriplet;
  readonly paid: RevenueTriplet;
  readonly open: RevenueTriplet;
}

export interface PaymentAmountInput {
  readonly amount: MoneyValue;
  /** Defaults to NET when omitted (e.g. transitional payloads). */
  readonly amountBasis?: PaymentAmountBasis;
  readonly status: 'recorded' | 'void';
}

export interface BillingRecordRevenueInput extends BillingAmountInput {
  readonly payments: readonly PaymentAmountInput[];
  readonly retentionHeldRemaining?: MoneyValue;
}

const TOLERANCE = 0.01;

function vatRateFromInvoice(
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): ReturnType<typeof toDecimalValue> {
  const net = input.subtotalAmount ?? input.totalAmount;
  const tax = input.taxAmount;
  if (!tax || isZeroMoney(tax) || isZeroMoney(net)) {
    return toDecimalValue(money('0', net.currency));
  }
  return toDecimalValue(tax).dividedBy(toDecimalValue(net));
}

export function tripletFromNet(
  net: MoneyValue,
  vatRate: ReturnType<typeof toDecimalValue>,
): RevenueTriplet {
  const vat = multiplyMoney(net, vatRate);
  return {
    net,
    vat,
    gross: addMoney(net, vat),
  };
}

export function tripletFromGross(
  gross: MoneyValue,
  input: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'>,
): RevenueTriplet {
  const ratio = billingNetToGrossRatio(input);
  const net = multiplyMoney(gross, ratio);
  return {
    net,
    vat: subtractMoney(gross, net),
    gross,
  };
}

export function zeroTriplet(currency: string): RevenueTriplet {
  const zero = zeroMoney(currency);
  return { net: zero, vat: zero, gross: zero };
}

export function resolvePaymentTriplet(
  amount: MoneyValue,
  basis: PaymentAmountBasis,
  invoice: Pick<BillingAmountInput, 'totalAmount' | 'subtotalAmount' | 'taxAmount'> | null,
): RevenueTriplet {
  if (basis === 'gross') {
    if (invoice) return tripletFromGross(amount, invoice);
    return { net: amount, vat: zeroMoney(amount.currency), gross: amount };
  }
  if (invoice) {
    return tripletFromNet(amount, vatRateFromInvoice(invoice));
  }
  return { net: amount, vat: zeroMoney(amount.currency), gross: amount };
}

export function invoiceBilledTriplet(input: BillingAmountInput): RevenueTriplet | null {
  if (input.status === 'void' || input.status === 'draft') return null;
  const net = input.subtotalAmount ?? input.totalAmount;
  const gross = resolveBillingGrossAmount(input);
  const vat = subtractMoney(gross, net);
  const sign = input.kind === 'credit_note' ? -1 : 1;
  const signed = (value: MoneyValue) => (sign === -1 ? negateMoney(value) : value);
  return {
    net: signed(net),
    vat: signed(vat),
    gross: signed(gross),
  };
}

export function sumPaymentTripletsForRecord(
  record: BillingAmountInput,
  payments: readonly PaymentAmountInput[],
  currency: string,
): RevenueTriplet {
  if (record.status === 'void' || record.status === 'draft') {
    return zeroTriplet(currency);
  }
  const active = payments.filter((p) => p.status === 'recorded');
  if (active.length === 0) return zeroTriplet(currency);

  const triplets = active.map((p) =>
    resolvePaymentTriplet(p.amount, p.amountBasis ?? 'net', record),
  );
  return {
    net: sumMoney(triplets.map((t) => t.net), currency),
    vat: sumMoney(triplets.map((t) => t.vat), currency),
    gross: sumMoney(triplets.map((t) => t.gross), currency),
  };
}

function retentionTriplet(record: BillingRecordRevenueInput, currency: string): RevenueTriplet {
  if (
    record.kind === 'credit_note' ||
    !record.retentionHeldRemaining ||
    isZeroMoney(record.retentionHeldRemaining)
  ) {
    return zeroTriplet(currency);
  }
  return tripletFromNet(record.retentionHeldRemaining, vatRateFromInvoice(record));
}

export function computeOpenTriplet(
  billed: RevenueTriplet,
  paid: RevenueTriplet,
  retention: RevenueTriplet,
  currency: string,
): RevenueTriplet {
  const openNet = subtractMoney(subtractMoney(billed.net, paid.net), retention.net);
  const openVat = subtractMoney(subtractMoney(billed.vat, paid.vat), retention.vat);
  const openGross = subtractMoney(subtractMoney(billed.gross, paid.gross), retention.gross);

  if (compareMoney(paid.net, billed.net) >= 0 && !isNegativeMoney(openNet)) {
    return zeroTriplet(currency);
  }

  return { net: openNet, vat: openVat, gross: openGross };
}

export function computeRecordRevenuePosition(
  record: BillingRecordRevenueInput,
  currency: string,
): { billed: RevenueTriplet; paid: RevenueTriplet; open: RevenueTriplet } | null {
  const billed = invoiceBilledTriplet(record);
  if (!billed) return null;
  const paid = sumPaymentTripletsForRecord(record, record.payments, currency);
  const retention = retentionTriplet(record, currency);
  const open = computeOpenTriplet(billed, paid, retention, currency);
  return { billed, paid, open };
}

export function aggregateRevenuePosition(
  records: readonly BillingRecordRevenueInput[],
  currency: string,
): RevenuePosition {
  let billed = zeroTriplet(currency);
  let paid = zeroTriplet(currency);
  let open = zeroTriplet(currency);

  for (const record of records) {
    const position = computeRecordRevenuePosition(record, currency);
    if (!position) continue;
    billed = {
      net: addMoney(billed.net, position.billed.net),
      vat: addMoney(billed.vat, position.billed.vat),
      gross: addMoney(billed.gross, position.billed.gross),
    };
    paid = {
      net: addMoney(paid.net, position.paid.net),
      vat: addMoney(paid.vat, position.paid.vat),
      gross: addMoney(paid.gross, position.paid.gross),
    };
    open = {
      net: addMoney(open.net, position.open.net),
      vat: addMoney(open.vat, position.open.vat),
      gross: addMoney(open.gross, position.open.gross),
    };
  }

  return { billed, paid, open };
}

export function aggregateRevenuePositionInCurrency(
  records: readonly (BillingRecordRevenueInput & { readonly totalAmount: MoneyValue })[],
  currency: string,
): RevenuePosition & {
  hasBillingData: boolean;
  excludedForeignCurrencyRecordCount: number;
} {
  if (records.length === 0) {
    const zero = zeroTriplet(currency);
    return {
      billed: zero,
      paid: zero,
      open: zero,
      hasBillingData: false,
      excludedForeignCurrencyRecordCount: 0,
    };
  }

  const matching = records.filter((r) => r.totalAmount.currency === currency);
  const position = aggregateRevenuePosition(matching, currency);
  return {
    ...position,
    hasBillingData: matching.some((r) => r.status !== 'draft' && r.status !== 'void'),
    excludedForeignCurrencyRecordCount: records.length - matching.length,
  };
}

export function deriveCollectionStatusFromOpen(
  open: RevenueTriplet,
  paid: RevenueTriplet,
  dueDate: BusinessDate | null,
  today: BusinessDate,
  recordStatus: BillingRecordStatus,
): CollectionStatus | null {
  if (recordStatus === 'draft' || recordStatus === 'void') return null;
  if (!isPositiveMoney(open.net) && !isPositiveMoney(open.gross)) return 'paid';
  if (isPositiveMoney(open.net) && dueDate && isBefore(dueDate, today)) return 'overdue';
  if (isZeroMoney(paid.net) && isZeroMoney(paid.gross)) return 'open';
  return 'partial';
}

export function reconciliationDiff(
  billed: RevenueTriplet,
  paid: RevenueTriplet,
  open: RevenueTriplet,
): { net: number; vat: number; gross: number } {
  const n = (v: MoneyValue) => Number(v.amount);
  return {
    net: Math.abs(n(billed.net) - n(paid.net) - n(open.net)),
    vat: Math.abs(n(billed.vat) - n(paid.vat) - n(open.vat)),
    gross: Math.abs(n(billed.gross) - n(paid.gross) - n(open.gross)),
  };
}

export function isReconciled(billed: RevenueTriplet, paid: RevenueTriplet, open: RevenueTriplet): boolean {
  const diff = reconciliationDiff(billed, paid, open);
  return diff.net <= TOLERANCE && diff.vat <= TOLERANCE && diff.gross <= TOLERANCE;
}
