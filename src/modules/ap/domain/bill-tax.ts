/**
 * AP bill tax split — reuse the shared tax engine (no second tax product).
 *
 * Actual / profit uses NET.
 * Payments / outstanding / aging use GROSS (`totalAmount`).
 * VAT is never invented for historical undivided rows.
 */

import { resolveTaxAmounts, type TaxInput } from '@/modules/expenses/domain/tax';
import { toNumericString, type MoneyValue } from '@/shared/money';

export type ApTaxBasis = 'canonical' | 'legacy_undivided' | 'zero_exempt';

export interface ApBillTaxSplit {
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly totalAmount: string;
  readonly amountIncludesTax: boolean | null;
  readonly taxBasis: ApTaxBasis;
  readonly taxSnapshot: {
    readonly netAmount: string;
    readonly taxAmount: string;
    readonly grossAmount: string;
    readonly currency: string;
    readonly capturedAt: string;
    readonly ratePercent: string | null;
    readonly method: string | null;
  } | null;
}

function moneyStr(value: MoneyValue | null | undefined, fallback: string): string {
  return value ? toNumericString(value) : fallback;
}

function isZeroTax(tax: string): boolean {
  return /^0+(\.0+)?$/.test(tax);
}

export function resolveApBillTaxSplit(input: TaxInput): ApBillTaxSplit {
  const resolved = resolveTaxAmounts(input);
  const net = toNumericString(resolved.netAmount);
  const tax = moneyStr(resolved.taxAmount, '0');
  const gross = toNumericString(resolved.grossAmount);

  const hasExplicitMode =
    input.amountIncludesTax === true || input.amountIncludesTax === false;
  const hasManual =
    Boolean(input.netAmount?.trim()) || Boolean(input.taxAmount?.trim());

  let taxBasis: ApTaxBasis = 'legacy_undivided';
  if (hasManual || hasExplicitMode) {
    taxBasis = isZeroTax(tax) ? 'zero_exempt' : 'canonical';
    if (hasExplicitMode && resolved.breakdown) {
      if (isZeroTax(tax)) taxBasis = 'zero_exempt';
      else taxBasis = 'canonical';
    }
  }

  return {
    netAmount: net,
    taxAmount: tax,
    grossAmount: gross,
    totalAmount: gross,
    amountIncludesTax:
      input.amountIncludesTax === true || input.amountIncludesTax === false
        ? input.amountIncludesTax
        : null,
    taxBasis,
    taxSnapshot: resolved.breakdown
      ? {
          netAmount: net,
          taxAmount: tax,
          grossAmount: gross,
          currency: resolved.grossAmount.currency,
          capturedAt: new Date().toISOString(),
          ratePercent: resolved.breakdown.ratePercent,
          method: resolved.breakdown.method,
        }
      : null,
  };
}

/** Amount that enters Actual / profit. Never VAT. */
export function vendorBillActualAmount(bill: {
  readonly netAmount?: string | null;
  readonly totalAmount: string;
}): string {
  const net = bill.netAmount?.trim();
  return net && net.length > 0 ? net : bill.totalAmount;
}

/** Amount that payments and aging apply against (payable GROSS). */
export function vendorBillPayableAmount(bill: {
  readonly grossAmount?: string | null;
  readonly totalAmount: string;
}): string {
  const gross = bill.grossAmount?.trim();
  return gross && gross.length > 0 ? gross : bill.totalAmount;
}
