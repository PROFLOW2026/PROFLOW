import { money, sumMoney, toNumericString, zeroMoney } from '@/shared/money/money';

/** Computes line totals for sales quote version creation. */
export function computeSalesQuoteTotals(
  lines: readonly { lineTotal: string; currency: string }[],
  currency: string,
  taxAmount: string | null | undefined,
): { subtotal: string; tax: string | null; total: string } {
  const lineValues = lines.map((line) => money(line.lineTotal, line.currency));
  const subtotal = sumMoney(lineValues, currency);
  const tax = taxAmount ? money(taxAmount, currency) : zeroMoney(currency);
  const total = taxAmount ? sumMoney([subtotal, tax], currency) : subtotal;

  return {
    subtotal: toNumericString(subtotal),
    tax: taxAmount ? toNumericString(tax) : null,
    total: toNumericString(total),
  };
}
