import { DomainRuleError } from '@/shared/errors';
import type { QuoteRecord, QuoteStatus } from './types';
import { assertQuoteIsNotBilling, isQuoteConvertible } from './lifecycle';
import { contractNetFromQuote } from './totals';

export type ConvertibleQuote = Pick<
  QuoteRecord,
  | 'status'
  | 'convertedAt'
  | 'convertedProjectId'
  | 'subtotalAmount'
  | 'taxAmount'
  | 'totalAmount'
  | 'currency'
  | 'clientId'
  | 'contactId'
  | 'title'
  | 'description'
  | 'notes'
>;

export function isQuoteAlreadyConverted(quote: ConvertibleQuote): boolean {
  return (
    quote.status === 'converted' ||
    quote.convertedAt != null ||
    quote.convertedProjectId != null
  );
}

export function resolveCompletedQuoteConversion(quote: ConvertibleQuote): {
  readonly projectId: string;
} | null {
  if (quote.convertedProjectId) {
    return { projectId: quote.convertedProjectId };
  }
  return null;
}

export function assertCanConvertQuote(quote: ConvertibleQuote): void {
  assertQuoteIsNotBilling();

  if (isQuoteAlreadyConverted(quote) && quote.status === 'converted') {
    throw new DomainRuleError(
      'Quote has already been converted',
      'quotes.errors.alreadyConverted',
    );
  }

  if (!isQuoteConvertible(quote.status as QuoteStatus) && !isQuoteAlreadyConverted(quote)) {
    throw new DomainRuleError(
      'Only an accepted quote can be converted into a project or job',
      'quotes.errors.notAccepted',
      { status: quote.status },
    );
  }

  const net = contractNetFromQuote(quote.subtotalAmount);
  if (!net) {
    throw new DomainRuleError(
      'Accepted quote must have a commercial subtotal before convert',
      'quotes.errors.noSubtotal',
    );
  }
}

/**
 * Opening contract amount: prefer net subtotal so VAT never becomes revenue basis.
 * Inclusive path only when caller explicitly marks amountIncludesTax.
 */
export function contractEnteredAmountFromQuote(
  quote: ConvertibleQuote,
  amountIncludesTax: boolean,
): { readonly enteredAmount: string; readonly amountIncludesTax: boolean } {
  const net = contractNetFromQuote(quote.subtotalAmount);
  if (!net) {
    throw new DomainRuleError(
      'Accepted quote must have a commercial subtotal before convert',
      'quotes.errors.noSubtotal',
    );
  }
  if (amountIncludesTax) {
    if (!quote.totalAmount) {
      throw new DomainRuleError(
        'Tax-inclusive convert requires quote total',
        'quotes.errors.noTotal',
      );
    }
    return { enteredAmount: quote.totalAmount, amountIncludesTax: true };
  }
  return { enteredAmount: net, amountIncludesTax: false };
}
