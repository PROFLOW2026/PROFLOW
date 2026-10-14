import { invoiceBilledTriplet, resolvePaymentTriplet } from '@/modules/billing/domain/revenue-position';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import { sumMoney, type MoneyValue } from '@/shared/money';
import { sanitizeBusinessText } from './format';
import type { YearBookBillingRow, YearBookReceiptRow } from './types';

export function resolveBillingClientLabel(summary: BillingRecordSummary): string {
  return summary.clientName?.trim() ?? '';
}

export function isForeignCurrencyRow(amountCurrency: string, bookCurrency: string): boolean {
  return amountCurrency.toUpperCase() !== bookCurrency.toUpperCase();
}

export function mapBillingSummaryToYearBookRow(
  summary: BillingRecordSummary,
  bookCurrency: string,
): { readonly row: YearBookBillingRow | null; readonly fxExcluded: boolean } {
  if (isForeignCurrencyRow(summary.totalAmount.currency, bookCurrency)) {
    return { row: null, fxExcluded: true };
  }
  const triplet = invoiceBilledTriplet({
    kind: summary.kind,
    status: summary.status,
    totalAmount: summary.totalAmount,
    subtotalAmount: summary.subtotalAmount ?? summary.totalAmount,
    taxAmount: summary.taxAmount ?? null,
  });
  if (!triplet) {
    return { row: null, fxExcluded: false };
  }
  return {
    row: {
      issueDate: summary.issueDate,
      client: sanitizeBusinessText(resolveBillingClientLabel(summary)),
      project: sanitizeBusinessText(summary.projectName?.trim() ?? ''),
      reference: sanitizeBusinessText(summary.reference?.trim() ?? ''),
      net: triplet.net,
      vat: triplet.vat,
      gross: triplet.gross,
      status: summary.status,
    },
    fxExcluded: false,
  };
}

export function sumYearBookBillingNetRows(
  rows: readonly YearBookBillingRow[],
  currency: string,
): MoneyValue {
  return sumMoney(
    rows.map((row) => row.net),
    currency,
  );
}

export function mapPaymentApplicationToYearBookReceipt(
  row: PaymentApplicationRow,
  bookCurrency: string,
  nature: 'actual' | 'expected',
): { readonly row: YearBookReceiptRow | null; readonly fxExcluded: boolean } {
  if (isForeignCurrencyRow(row.amount.currency, bookCurrency)) {
    return { row: null, fxExcluded: true };
  }
  const invoice =
    row.billingTotalAmount && row.billingStatus !== 'void' && row.billingStatus !== 'draft'
      ? {
          totalAmount: row.billingTotalAmount,
          subtotalAmount: row.billingSubtotalAmount ?? row.billingTotalAmount,
          taxAmount: row.billingTaxAmount ?? null,
        }
      : null;
  const basis = row.paymentAmountBasis ?? 'gross';
  const triplet = resolvePaymentTriplet(row.amount, basis, invoice);
  return {
    row: {
      date: row.paymentDate,
      client: sanitizeBusinessText(row.clientName?.trim() ?? ''),
      project: sanitizeBusinessText(row.projectName?.trim() ?? ''),
      net: triplet.net,
      vat: triplet.vat,
      gross: triplet.gross,
      nature,
    },
    fxExcluded: false,
  };
}
