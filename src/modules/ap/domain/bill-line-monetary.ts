/**
 * AP bill line NET / TAX / GROSS split — canonical economic amounts per line.
 *
 * Actual / profitability uses Σ line NET = bill NET.
 * Payable / PO matching uses Σ line GROSS = bill GROSS.
 * VAT never enters category buckets.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  divideMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export interface ApLineMonetaryInput {
  readonly lineTotal: string;
}

export type ApLineAmountBasis = 'gross' | 'net';

export interface ApLineMonetarySplit {
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

/**
 * Derive per-line NET/TAX/GROSS from bill totals and line weights.
 * When basis is `net`, lineTotal values are NET weights (tax-exclusive entry).
 * When basis is `gross`, lineTotal values are GROSS weights (tax-inclusive entry).
 */
export function allocateApLineMonetarySplits(input: {
  readonly currency: string;
  readonly billNetAmount: string;
  readonly billTaxAmount: string;
  readonly billGrossAmount: string;
  readonly lineAmountBasis?: ApLineAmountBasis;
  readonly lines: readonly ApLineMonetaryInput[];
}): readonly ApLineMonetarySplit[] {
  const currency = input.currency.toUpperCase();
  const billNet = money(input.billNetAmount, currency);
  const billTax = money(input.billTaxAmount, currency);
  const billGross = money(input.billGrossAmount, currency);
  const basis = input.lineAmountBasis ?? 'gross';
  const lineWeights = input.lines.map((line) => money(line.lineTotal, currency));

  if (lineWeights.length === 0) return [];

  if (basis === 'net') {
    const netSum = sumMoney(lineWeights, currency);
    if (compareMoney(netSum, billNet) !== 0) {
      throw new DomainRuleError(
        'Line NET totals must equal the bill NET amount',
        'ap.errors.lineNetMismatch',
      );
    }
    if (compareMoney(billTax, zeroMoney(currency)) === 0) {
      return lineWeights.map((net) => ({
        netAmount: toNumericString(net),
        taxAmount: toNumericString(zeroMoney(currency)),
        grossAmount: toNumericString(net),
      }));
    }
    const splits: ApLineMonetarySplit[] = [];
    let netRemaining = billNet;
    let taxRemaining = billTax;
    for (let i = 0; i < lineWeights.length; i += 1) {
      const net = lineWeights[i]!;
      const isLast = i === lineWeights.length - 1;
      if (isLast) {
        splits.push({
          netAmount: toNumericString(netRemaining),
          taxAmount: toNumericString(taxRemaining),
          grossAmount: toNumericString(addMoney(netRemaining, taxRemaining)),
        });
        continue;
      }
      const weight = divideMoney(net, netSum.amount);
      const lineTax = multiplyMoney(billTax, weight.amount);
      const lineGross = addMoney(net, lineTax);
      netRemaining = subtractMoney(netRemaining, net);
      taxRemaining = subtractMoney(taxRemaining, lineTax);
      splits.push({
        netAmount: toNumericString(net),
        taxAmount: toNumericString(lineTax),
        grossAmount: toNumericString(lineGross),
      });
    }
    return splits;
  }

  const grossSum = sumMoney(lineWeights, currency);
  if (compareMoney(grossSum, billGross) !== 0) {
    throw new DomainRuleError(
      'Line gross totals must equal the bill gross amount',
      'ap.errors.lineGrossMismatch',
    );
  }

  if (compareMoney(billTax, zeroMoney(currency)) === 0) {
    return lineWeights.map((gross) => ({
      netAmount: toNumericString(gross),
      taxAmount: toNumericString(zeroMoney(currency)),
      grossAmount: toNumericString(gross),
    }));
  }

  const splits: ApLineMonetarySplit[] = [];
  let netRemaining = billNet;
  let taxRemaining = billTax;

  for (let i = 0; i < lineWeights.length; i += 1) {
    const gross = lineWeights[i]!;
    const isLast = i === lineWeights.length - 1;
    if (isLast) {
      splits.push({
        netAmount: toNumericString(netRemaining),
        taxAmount: toNumericString(taxRemaining),
        grossAmount: toNumericString(gross),
      });
      continue;
    }
    const weight = divideMoney(gross, grossSum.amount);
    const lineNet = multiplyMoney(billNet, weight.amount);
    const lineTax = multiplyMoney(billTax, weight.amount);
    netRemaining = subtractMoney(netRemaining, lineNet);
    taxRemaining = subtractMoney(taxRemaining, lineTax);
    splits.push({
      netAmount: toNumericString(lineNet),
      taxAmount: toNumericString(lineTax),
      grossAmount: toNumericString(gross),
    });
  }

  return splits;
}

/** Sum line NET and compare to bill NET (cent-exact). */
export function assertApLineNetConservesBill(input: {
  readonly currency: string;
  readonly billNetAmount: string;
  readonly lineNetAmounts: readonly string[];
}): void {
  const currency = input.currency.toUpperCase();
  const billNet = money(input.billNetAmount, currency);
  const lineSum = sumMoney(
    input.lineNetAmounts.map((amount) => money(amount, currency)),
    currency,
  );
  if (compareMoney(lineSum, billNet) !== 0) {
    throw new DomainRuleError(
      'Line NET totals must equal the bill NET amount',
      'ap.errors.lineNetMismatch',
    );
  }
}

export function lineNetMoney(
  line: { readonly netAmount?: string | null; readonly lineTotal: string },
  currency: string,
): MoneyValue {
  const net = line.netAmount?.trim();
  if (net && net.length > 0) return money(net, currency);
  return money(line.lineTotal, currency);
}
