import {
  assertInclusiveTaxRateAvailable,
  computeTaxAmountBreakdown,
  type TaxAmountBreakdown,
} from '@/modules/tax/domain/amounts';
import type { ResolvedTaxRate } from '@/modules/tax/domain/types';
import { addMoney, money, subtractMoney, toDecimalValue, type MoneyValue } from '@/shared/money';
import { toIsoInstant } from '@/shared/dates';
import type { TaxSnapshot } from './types';

export interface TaxInput {
  /**
   * User-entered amount. Semantics depend on `amountIncludesTax` when that flag
   * is set; otherwise treated as legacy gross=net fast capture.
   */
  readonly enteredAmount: string;
  readonly currency: string;
  /**
   * When set, derive net/tax/gross from the org tax rule via the shared tax
   * engine (`computeTaxAmountBreakdown`). When omitted, preserve legacy
   * gross-first capture (net = gross, tax = null) unless manual net/tax override.
   */
  readonly amountIncludesTax?: boolean | null;
  /** Advanced capture may supply net and tax explicitly (bypasses tax engine). */
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  /** Org / country-pack rule resolved for the expense date — never a hardcoded rate. */
  readonly resolved?: Pick<ResolvedTaxRate, 'method' | 'ratePercent'> | null;
}

export interface ResolvedExpenseTaxAmounts {
  readonly netAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly grossAmount: MoneyValue;
  /** Present when amounts came from the shared tax engine. */
  readonly breakdown: TaxAmountBreakdown | null;
}

function resolveManualTaxAmounts(input: {
  readonly enteredAmount: string;
  readonly currency: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
}): ResolvedExpenseTaxAmounts {
  const currency = input.currency;
  const grossAmount = money(input.enteredAmount, currency);

  if (input.netAmount?.trim()) {
    const netAmount = money(input.netAmount, currency);
    const taxAmount = input.taxAmount?.trim() ? money(input.taxAmount, currency) : null;
    if (taxAmount) {
      const recomputed = addMoney(netAmount, taxAmount);
      if (recomputed.amount !== grossAmount.amount) {
        return {
          netAmount,
          taxAmount,
          grossAmount: recomputed,
          breakdown: null,
        };
      }
    }
    return { netAmount, taxAmount, grossAmount, breakdown: null };
  }

  if (input.taxAmount?.trim()) {
    const taxAmount = money(input.taxAmount, currency);
    const netAmount = subtractMoney(grossAmount, taxAmount);
    return { netAmount, taxAmount, grossAmount, breakdown: null };
  }

  return { netAmount: grossAmount, taxAmount: null, grossAmount, breakdown: null };
}

/**
 * Builds net/tax/gross from capture input.
 *
 * - Explicit net/tax override → manual path (advanced capture / corrections).
 * - `amountIncludesTax` set → shared tax engine + org rule (inclusive/exclusive).
 * - Otherwise → legacy fast capture: entered amount is both net and gross.
 *
 * Profitability Actual Cost always uses **net**.
 */
export function resolveTaxAmounts(input: TaxInput): ResolvedExpenseTaxAmounts {
  const hasManualOverride =
    Boolean(input.netAmount?.trim()) || Boolean(input.taxAmount?.trim());

  if (hasManualOverride) {
    return resolveManualTaxAmounts({
      enteredAmount: input.enteredAmount,
      currency: input.currency,
      netAmount: input.netAmount,
      taxAmount: input.taxAmount,
    });
  }

  if (input.amountIncludesTax === true || input.amountIncludesTax === false) {
    assertInclusiveTaxRateAvailable(input.amountIncludesTax, input.resolved ?? null);
    const breakdown = computeTaxAmountBreakdown({
      enteredAmount: input.enteredAmount,
      currency: input.currency,
      amountIncludesTax: input.amountIncludesTax,
      resolved: input.resolved ?? null,
    });
    return {
      netAmount: breakdown.net,
      taxAmount: toDecimalValue(breakdown.tax).isZero() ? null : breakdown.tax,
      grossAmount: breakdown.gross,
      breakdown,
    };
  }

  // Legacy: no mode flag → treat entered as both net and gross (no invented VAT).
  const entered = money(input.enteredAmount, input.currency);
  return {
    netAmount: entered,
    taxAmount: null,
    grossAmount: entered,
    breakdown: null,
  };
}

/**
 * Infers edit-form defaults from persisted amounts without a stored mode column.
 * Tax present → show gross as including; otherwise show net as excluding.
 */
export function inferExpenseTaxModeFromAmounts(input: {
  readonly netAmount: string;
  readonly taxAmount: string | null | undefined;
  readonly grossAmount: string;
}): { readonly amount: string; readonly amountIncludesTax: boolean } {
  const taxRaw = input.taxAmount?.trim() ?? '';
  const hasTax = taxRaw !== '' && !/^0+(\.0+)?$/.test(taxRaw);
  if (hasTax) {
    return {
      amount: input.grossAmount.replace(/^-/, ''),
      amountIncludesTax: true,
    };
  }
  return {
    amount: input.netAmount.replace(/^-/, ''),
    amountIncludesTax: false,
  };
}

/** Frozen at finalization; later tax rule edits never rewrite it (doc 04 §13). */
export function captureTaxSnapshot(
  netAmount: MoneyValue,
  taxAmount: MoneyValue | null,
  grossAmount: MoneyValue,
): TaxSnapshot {
  return {
    netAmount: netAmount.amount,
    taxAmount: taxAmount?.amount ?? null,
    grossAmount: grossAmount.amount,
    currency: grossAmount.currency,
    capturedAt: toIsoInstant(new Date()),
  };
}
