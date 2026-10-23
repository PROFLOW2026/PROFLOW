import Decimal from 'decimal.js';
import {
  compareMoney,
  displayScaleFor,
  isMaterialPositiveMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  roundMoney,
  toDecimalValue,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import { tripletFromGross, tripletFromNet } from './revenue-position';

/** Stable keys stored on payments.method. Legacy free text is left untouched. */
export const BILLING_PAYMENT_METHOD_KEYS = [
  'cash',
  'check',
  'bank_transfer',
  'credit_card',
  'other',
] as const;

export type BillingPaymentMethodKey = (typeof BILLING_PAYMENT_METHOD_KEYS)[number];

export type PaymentVatEntry = 'gross' | 'net';

export function isBillingPaymentMethodKey(value: string): value is BillingPaymentMethodKey {
  return (BILLING_PAYMENT_METHOD_KEYS as readonly string[]).includes(value);
}

/** Known keys become labels. Older free-text values are shown as stored. */
export function labelForStoredPaymentMethod(
  method: string | null | undefined,
  labels: Readonly<Record<BillingPaymentMethodKey, string>>,
): string | null {
  const raw = method?.trim();
  if (!raw) return null;
  if (isBillingPaymentMethodKey(raw)) return labels[raw];
  return raw;
}

export interface PaymentEntryInvoice {
  readonly totalAmount: MoneyValue;
  readonly subtotalAmount?: MoneyValue;
  readonly taxAmount?: MoneyValue | null;
  readonly outstandingAmount: MoneyValue;
  readonly outstandingGrossAmount?: MoneyValue;
}

function fieldString(value: MoneyValue): string {
  return new Decimal(roundMoney(value).amount).toFixed(displayScaleFor(value.currency));
}

function invoiceTripletInput(invoice: PaymentEntryInvoice) {
  return {
    totalAmount: invoice.totalAmount,
    subtotalAmount: invoice.subtotalAmount,
    taxAmount: invoice.taxAmount ?? null,
  };
}

function vatRate(invoice: PaymentEntryInvoice) {
  const net = invoice.subtotalAmount ?? invoice.totalAmount;
  const tax = invoice.taxAmount;
  if (!tax || isZeroMoney(tax) || isZeroMoney(net)) return null;
  return toDecimalValue(tax).dividedBy(toDecimalValue(net));
}

export function outstandingForVatEntry(
  invoice: PaymentEntryInvoice,
  basis: PaymentVatEntry,
): MoneyValue {
  if (basis === 'net') return roundMoney(invoice.outstandingAmount);
  if (invoice.outstandingGrossAmount) return roundMoney(invoice.outstandingGrossAmount);
  const rate = vatRate(invoice);
  if (!rate) return roundMoney(invoice.outstandingAmount);
  return roundMoney(tripletFromNet(invoice.outstandingAmount, rate).gross);
}

/** Net amount the existing payment engine stores (`amountBasis: 'net'`). */
export function netStringForPaymentEntry(input: {
  readonly entered: string;
  readonly basis: PaymentVatEntry;
  readonly currency: string;
  readonly invoice: PaymentEntryInvoice;
}): string | null {
  const trimmed = input.entered.trim();
  if (!trimmed) return null;
  let entered: MoneyValue;
  try {
    entered = money(trimmed, input.currency);
  } catch {
    return null;
  }
  if (!isPositiveMoney(entered)) return null;
  if (input.basis === 'net') return toNumericString(roundMoney(entered));

  const roundedEntered = roundMoney(entered);
  const outstandingGross = outstandingForVatEntry(input.invoice, 'gross');
  if (
    isPositiveMoney(outstandingGross) &&
    compareMoney(roundedEntered, outstandingGross) === 0
  ) {
    return toNumericString(roundMoney(input.invoice.outstandingAmount));
  }

  const rate = vatRate(input.invoice);
  if (!rate) return toNumericString(roundedEntered);
  const net = tripletFromGross(roundedEntered, invoiceTripletInput(input.invoice)).net;
  return toNumericString(roundMoney(net));
}

/** Visible field text for a stored net amount in the selected VAT basis. */
export function displayStringForStoredNet(input: {
  readonly netAmount: string;
  readonly currency: string;
  readonly basis: PaymentVatEntry;
  readonly invoice: PaymentEntryInvoice;
}): string | null {
  let net: MoneyValue;
  try {
    net = money(input.netAmount, input.currency);
  } catch {
    return null;
  }
  if (input.basis === 'net') return fieldString(net);
  const rate = vatRate(input.invoice);
  const shown = rate ? tripletFromNet(net, rate).gross : net;
  return fieldString(shown);
}

/** Balance worth showing on a collection alert. Null when both sides round to 0.00. */
export function displayedCollectibleOutstanding(record: {
  readonly outstandingAmount: MoneyValue;
  readonly outstandingGrossAmount?: MoneyValue;
}): MoneyValue | null {
  if (isMaterialPositiveMoney(record.outstandingAmount)) return record.outstandingAmount;
  if (
    record.outstandingGrossAmount &&
    isMaterialPositiveMoney(record.outstandingGrossAmount)
  ) {
    return record.outstandingGrossAmount;
  }
  return null;
}

/** Collection alerts prefer gross balance (incl. VAT) when material — matches billing cards. */
export function displayedCollectionAlertAmount(record: {
  readonly outstandingAmount: MoneyValue;
  readonly outstandingGrossAmount?: MoneyValue;
}): MoneyValue | null {
  if (
    record.outstandingGrossAmount &&
    isMaterialPositiveMoney(record.outstandingGrossAmount)
  ) {
    return record.outstandingGrossAmount;
  }
  return displayedCollectibleOutstanding(record);
}

export function fillOutstandingDisplay(
  invoice: PaymentEntryInvoice,
  basis: PaymentVatEntry,
): string {
  return fieldString(outstandingForVatEntry(invoice, basis));
}
