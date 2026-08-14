import Decimal from 'decimal.js';
import {
  compareMoney,
  money,
  subtractMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import type { QuoteStatus } from './types';

/**
 * Customer discount on a standalone estimate (src/modules/quotes).
 *
 * Schema stores `estimates.discount_amount`, `list_subtotal_amount`, and
 * `discount_percent`. The issue/`sent` gate prefers stored `discount_amount`.
 * This is NOT CRM sales-quote discount and NOT commercial change-order quote
 * concession — those objects do not share these semantics.
 */
export interface QuoteDiscountBasis {
  readonly currency: string;
  readonly subtotalAmount: string | null;
  readonly totalAmount: string | null;
  /** Explicit customer discount in quote currency. */
  readonly discountAmount?: string | null;
  /** Catalogue / list commercial net before discount. */
  readonly listSubtotalAmount?: string | null;
  /** Discount percent (0–100) when no money discount is stored. */
  readonly discountPercent?: string | null;
}

export interface QuoteDiscountGateAmount {
  readonly amount: string;
  readonly currency: string;
}

function hasText(value: string | null | undefined): value is string {
  return value != null && String(value).trim() !== '';
}

function isPositiveMoney(amount: string, currency: string): boolean {
  return compareMoney(money(amount, currency), zeroMoney(currency)) > 0;
}

function isPositivePercent(value: string): boolean {
  try {
    return new Decimal(value).greaterThan(0);
  } catch {
    return false;
  }
}

/**
 * Money amount submitted to `quote_discount` approval rules.
 *
 * The rule is a money threshold, so:
 * 1. Explicit discount amount (preferred) — that is what the rule measures.
 * 2. Else list subtotal − quoted subtotal when list is higher (implied discount).
 * 3. Else quote total when a discount percent is present (percent cannot be
 *    compared to a money threshold).
 * 4. Null when no discount exists → the issue/send gate must not run.
 */
export function quoteDiscountAmountForApproval(
  quote: QuoteDiscountBasis,
): QuoteDiscountGateAmount | null {
  const currency = quote.currency.trim().toUpperCase();
  if (!currency) return null;

  if (hasText(quote.discountAmount) && isPositiveMoney(quote.discountAmount, currency)) {
    return { amount: toNumericString(money(quote.discountAmount, currency)), currency };
  }

  if (hasText(quote.listSubtotalAmount) && hasText(quote.subtotalAmount)) {
    const list = money(quote.listSubtotalAmount, currency);
    const quoted = money(quote.subtotalAmount, currency);
    if (compareMoney(list, quoted) > 0) {
      return { amount: toNumericString(subtractMoney(list, quoted)), currency };
    }
  }

  if (hasText(quote.discountPercent) && isPositivePercent(quote.discountPercent)) {
    const quotedTotal = hasText(quote.totalAmount)
      ? quote.totalAmount
      : quote.subtotalAmount;
    if (hasText(quotedTotal)) {
      return { amount: toNumericString(money(quotedTotal, currency)), currency };
    }
  }

  return null;
}

/** `sent` is the customer-facing / locked issue. `ready` stays editable. */
export function isQuoteDiscountGateTransition(toStatus: QuoteStatus): boolean {
  return toStatus === 'sent';
}
