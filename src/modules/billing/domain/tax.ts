import {
  assertInclusiveTaxRateAvailable,
  computeTaxAmountBreakdown,
} from '@/modules/tax/domain/amounts';
import type { ResolvedTaxRate } from '@/modules/tax/domain/types';
import {
  addMoney,
  money,
  subtractMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import { toIsoInstant } from '@/shared/dates';
import type { ExpenseVatMode } from '@/modules/expenses/domain/vat-mode';
import {
  parseExpenseVatModeFromForm,
  resolveExpenseVatMode,
} from '@/modules/expenses/domain/vat-mode';
import { DomainRuleError } from '@/shared/errors';
import type { TaxSnapshot } from './types';

export type BillingVatMode = ExpenseVatMode;

export interface TaxInput {
  /** User-entered amount; semantics depend on vatMode / net+tax overrides. */
  readonly amount: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly currency: string;
  /** Owner-selected VAT entry mode (same semantics as expenses). */
  readonly vatMode?: BillingVatMode | null;
  /** Org tax rule for the billing date — never a hardcoded rate. */
  readonly resolved?: Pick<ResolvedTaxRate, 'method' | 'ratePercent'> | null;
}

/**
 * Resolves subtotal/tax/total from capture input.
 *
 * - Explicit net/tax → advanced / BOQ path
 * - vatMode set → shared tax engine (exclusive / inclusive / zero)
 * - otherwise → legacy: entered is both subtotal and total (tax null)
 */
export function resolveTaxAmounts(input: TaxInput): {
  subtotalAmount: MoneyValue;
  taxAmount: MoneyValue | null;
  totalAmount: MoneyValue;
} {
  const currency = input.currency;
  const hasManualOverride =
    Boolean(input.netAmount?.trim()) || Boolean(input.taxAmount?.trim());

  if (hasManualOverride) {
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
  }

  if (input.vatMode != null) {
    const vatMode = resolveExpenseVatMode({ vatMode: input.vatMode, forCreate: true });

    if (vatMode === 'zero') {
      const entered = money(input.amount, currency);
      return { subtotalAmount: entered, taxAmount: money('0', currency), totalAmount: entered };
    }

    const amountIncludesTax = vatMode === 'inclusive';
    assertInclusiveTaxRateAvailable(amountIncludesTax, input.resolved ?? null);
    const breakdown = computeTaxAmountBreakdown({
      enteredAmount: input.amount,
      currency,
      amountIncludesTax,
      resolved: input.resolved ?? null,
    });

    return {
      subtotalAmount: breakdown.net,
      taxAmount: toDecimalValue(breakdown.tax).isZero() ? null : breakdown.tax,
      totalAmount: breakdown.gross,
    };
  }

  // Draft-only legacy path — finalize must supply vatMode or explicit net/tax.
  const totalAmount = money(input.amount, currency);
  return { subtotalAmount: totalAmount, taxAmount: null, totalAmount };
}

/** Infer stored vat_mode when callers pass net/tax overrides without an explicit mode. */
export function inferBillingVatModeForCapture(input: {
  readonly vatMode?: BillingVatMode | null;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly resolvedTaxAmount: MoneyValue | null;
}): BillingVatMode | null {
  if (input.vatMode != null) {
    return resolveExpenseVatMode({ vatMode: input.vatMode, forCreate: true });
  }
  if (input.netAmount?.trim() && input.taxAmount?.trim()) {
    return 'exclusive';
  }
  if (input.resolvedTaxAmount && !toDecimalValue(input.resolvedTaxAmount).isZero()) {
    return 'exclusive';
  }
  if (input.resolvedTaxAmount && toDecimalValue(input.resolvedTaxAmount).isZero()) {
    return 'zero';
  }
  return null;
}

/** Finalized rows must never have ambiguous VAT (matches DB constraint 0082). */
export function assertBillingVatExplicitForFinalize(input: {
  readonly vatMode: BillingVatMode | null | undefined;
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly totalAmount: MoneyValue;
}): void {
  if (!input.vatMode) {
    throw new DomainRuleError(
      'VAT mode is required before finalizing a billing record',
      'billing.errors.vatModeRequiredForFinalize',
    );
  }

  if (input.vatMode === 'zero') {
    const tax = input.taxAmount ?? money('0', input.totalAmount.currency);
    if (!toDecimalValue(tax).isZero() || input.subtotalAmount.amount !== input.totalAmount.amount) {
      throw new DomainRuleError(
        'Zero-rated billing must have no VAT and matching subtotal/total',
        'billing.errors.zeroVatInconsistent',
      );
    }
    return;
  }

  if (!input.taxAmount || toDecimalValue(input.taxAmount).isZero()) {
    throw new DomainRuleError(
      'Standard VAT billing must include a tax amount before finalization',
      'billing.errors.taxRequiredForFinalize',
    );
  }

  const recomputed = addMoney(input.subtotalAmount, input.taxAmount);
  if (recomputed.amount !== input.totalAmount.amount) {
    throw new DomainRuleError(
      'Billing total must equal subtotal plus tax before finalization',
      'billing.errors.vatTotalsMismatch',
    );
  }
}

export function taxAmountForStorage(
  vatMode: BillingVatMode | null | undefined,
  taxAmount: MoneyValue | null,
  _currency: string,
): string | null {
  if (vatMode === 'zero') return '0';
  return taxAmount ? taxAmount.amount : null;
}

export function parseBillingVatModeFromForm(value: unknown): BillingVatMode | undefined {
  return parseExpenseVatModeFromForm(value);
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
