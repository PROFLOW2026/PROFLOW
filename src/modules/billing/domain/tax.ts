import { addMoney, money, subtractMoney, type MoneyValue } from '@/shared/money';
import { toIsoInstant } from '@/shared/dates';
import type { TaxSnapshot } from './types';

export interface TaxInput {
  readonly amount: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly currency: string;
}

/**
 * Resolves subtotal/tax/total from capture input. Fast capture supplies amount only;
 * advanced capture may supply net and tax explicitly.
 */
export function resolveTaxAmounts(input: TaxInput): {
  subtotalAmount: MoneyValue;
  taxAmount: MoneyValue | null;
  totalAmount: MoneyValue;
} {
  const currency = input.currency;
  const totalAmount = money(input.amount, currency);

  if (input.netAmount?.trim()) {
    const subtotalAmount = money(input.netAmount, currency);
    const taxAmount = input.taxAmount?.trim() ? money(input.taxAmount, currency) : null;
    if (taxAmount) {
      const recomputed = addMoney(subtotalAmount, taxAmount);
      if (recomputed.amount !== totalAmount.amount) {
        return { subtotalAmount, taxAmount, totalAmount: recomputed };
      }
    }
    return { subtotalAmount, taxAmount, totalAmount };
  }

  if (input.taxAmount?.trim()) {
    const taxAmount = money(input.taxAmount, currency);
    const subtotalAmount = subtractMoney(totalAmount, taxAmount);
    return { subtotalAmount, taxAmount, totalAmount };
  }

  return { subtotalAmount: totalAmount, taxAmount: null, totalAmount };
}

/** Frozen at finalization; later tax rule edits never rewrite it (doc 04 §13). */
export function captureTaxSnapshot(
  subtotalAmount: MoneyValue,
  taxAmount: MoneyValue | null,
  totalAmount: MoneyValue,
): TaxSnapshot {
  return {
    subtotalAmount: subtotalAmount.amount,
    taxAmount: taxAmount?.amount ?? null,
    totalAmount: totalAmount.amount,
    currency: totalAmount.currency,
    capturedAt: toIsoInstant(new Date()),
  };
}
