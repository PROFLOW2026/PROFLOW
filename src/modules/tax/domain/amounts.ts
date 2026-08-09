import Decimal from 'decimal.js';
import {
  addMoney,
  divideMoney,
  money,
  percentOfMoney,
  subtractMoney,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ResolvedTaxRate, TaxRuleRecord } from './types';

export type AmountTaxMode = 'excluding' | 'including';
export type TaxRuleMethod = TaxRuleRecord['method'];

export interface ContractTaxSnapshot {
  readonly enteredAmount: string;
  readonly amountIncludesTax: boolean;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly ratePercent: string | null;
  readonly method: TaxRuleMethod | null;
  readonly ruleId: string | null;
  readonly ruleKey: string | null;
  readonly ruleName: string | null;
  readonly capturedAt: string;
}

export interface TaxAmountBreakdown {
  readonly entered: MoneyValue;
  readonly amountIncludesTax: boolean;
  readonly net: MoneyValue;
  readonly tax: MoneyValue;
  readonly gross: MoneyValue;
  readonly ratePercent: string | null;
  readonly method: TaxRuleMethod | null;
}

/**
 * Derives net / VAT / gross from a user-entered project amount and the resolved
 * tax rule. Contract / profitability values use **net**; VAT is never treated
 * as commercial revenue.
 */
export function computeTaxAmountBreakdown(input: {
  readonly enteredAmount: string | MoneyValue;
  readonly currency: string;
  readonly amountIncludesTax: boolean;
  readonly resolved: Pick<ResolvedTaxRate, 'method' | 'ratePercent'> | null;
}): TaxAmountBreakdown {
  const currency =
    typeof input.enteredAmount === 'string' ? input.currency : input.enteredAmount.currency;
  const entered =
    typeof input.enteredAmount === 'string'
      ? money(input.enteredAmount, currency)
      : input.enteredAmount;

  const method = input.resolved?.method ?? null;
  const ratePercent = input.resolved?.ratePercent ?? null;
  const taxable =
    method === 'percentage' && ratePercent !== null && ratePercent !== undefined && ratePercent !== '';

  if (!taxable) {
    const zero = zeroMoney(currency);
    return {
      entered,
      amountIncludesTax: input.amountIncludesTax,
      net: entered,
      tax: zero,
      gross: entered,
      ratePercent,
      method,
    };
  }

  if (input.amountIncludesTax) {
    const gross = entered;
    const net = netFromInclusiveGross(gross, ratePercent!);
    const tax = subtractMoney(gross, net);
    return {
      entered,
      amountIncludesTax: true,
      net,
      tax,
      gross,
      ratePercent,
      method,
    };
  }

  const net = entered;
  const tax = percentOfMoney(net, ratePercent!);
  const gross = addMoney(net, tax);
  return {
    entered,
    amountIncludesTax: false,
    net,
    tax,
    gross,
    ratePercent,
    method,
  };
}

/** net = gross / (1 + ratePercent/100) with money-scale normalisation. */
export function netFromInclusiveGross(gross: MoneyValue, ratePercent: string): MoneyValue {
  const factor = new Decimal(1).plus(new Decimal(ratePercent).dividedBy(100));
  if (factor.lte(0)) {
    throw new Error(`Invalid tax rate factor for inclusive amount: ${ratePercent}`);
  }
  return divideMoney(gross, factor);
}

export function buildContractTaxSnapshot(
  breakdown: TaxAmountBreakdown,
  resolved: ResolvedTaxRate | null,
  capturedAt: string,
): ContractTaxSnapshot {
  return {
    enteredAmount: breakdown.entered.amount,
    amountIncludesTax: breakdown.amountIncludesTax,
    netAmount: breakdown.net.amount,
    taxAmount: breakdown.tax.amount,
    grossAmount: breakdown.gross.amount,
    currency: breakdown.entered.currency,
    ratePercent: breakdown.ratePercent,
    method: breakdown.method,
    ruleId: resolved?.ruleId ?? null,
    ruleKey: resolved?.key ?? null,
    ruleName: resolved?.name ?? null,
    capturedAt,
  };
}

export function assertInclusiveTaxRateAvailable(
  amountIncludesTax: boolean,
  resolved: Pick<ResolvedTaxRate, 'method' | 'ratePercent'> | null,
): void {
  if (!amountIncludesTax) return;
  const taxable =
    resolved?.method === 'percentage' &&
    resolved.ratePercent !== null &&
    resolved.ratePercent !== undefined &&
    String(resolved.ratePercent).trim() !== '';
  if (!taxable) {
    throw new Error('INCLUSIVE_TAX_RATE_REQUIRED');
  }
}

/** Convenience for tests and UI previews. */
export function factorForRatePercent(ratePercent: string): Decimal {
  return new Decimal(1).plus(new Decimal(ratePercent).dividedBy(100));
}

export function isZeroTaxBreakdown(breakdown: TaxAmountBreakdown): boolean {
  return toDecimalValue(breakdown.tax).isZero();
}
