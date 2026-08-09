import { addMoney, money, subtractMoney, type MoneyValue } from '@/shared/money';
import { toIsoInstant } from '@/shared/dates';
import type { TaxSnapshot } from './types';

export interface TaxInput {
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly grossAmount: string;
  readonly currency: string;
}

/**
 * Builds net/tax/gross from capture input. Fast capture supplies gross only;
 * advanced capture may supply net and tax explicitly.
 */
export function resolveTaxAmounts(input: TaxInput): {
  netAmount: MoneyValue;
  taxAmount: MoneyValue | null;
  grossAmount: MoneyValue;
} {
  const currency = input.currency;
  const grossAmount = money(input.grossAmount, currency);

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
        };
      }
    }
    return { netAmount, taxAmount, grossAmount };
  }

  if (input.taxAmount?.trim()) {
    const taxAmount = money(input.taxAmount, currency);
    const netAmount = subtractMoney(grossAmount, taxAmount);
    return { netAmount, taxAmount, grossAmount };
  }

  return { netAmount: grossAmount, taxAmount: null, grossAmount };
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
