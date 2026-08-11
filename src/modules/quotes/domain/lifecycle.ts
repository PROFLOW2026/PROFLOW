import { DomainRuleError } from '@/shared/errors';
import type { QuoteStatus } from './types';

/**
 * draft → ready | sent | cancelled
 * ready → draft | sent | cancelled
 * sent → accepted | rejected | expired | cancelled
 * accepted → converted (via convert action only)
 * rejected | expired | cancelled | converted = terminal
 */
const ALLOWED: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  draft: ['ready', 'sent', 'cancelled'],
  ready: ['draft', 'sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: ['converted'],
  rejected: [],
  expired: [],
  cancelled: [],
  converted: [],
};

export function canTransitionQuoteStatus(from: QuoteStatus, to: QuoteStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

export function assertCanTransitionQuoteStatus(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransitionQuoteStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition quote from ${from} to ${to}`,
      'quotes.errors.invalidTransition',
      { from, to },
    );
  }
}

export function isQuoteEditable(status: QuoteStatus): boolean {
  return status === 'draft' || status === 'ready';
}

export function assertQuoteEditable(status: QuoteStatus): void {
  if (!isQuoteEditable(status)) {
    throw new DomainRuleError(
      'Only draft or ready quotes can be edited',
      'quotes.errors.notEditable',
      { status },
    );
  }
}

export function isQuoteTerminal(status: QuoteStatus): boolean {
  return (
    status === 'rejected' ||
    status === 'expired' ||
    status === 'cancelled' ||
    status === 'converted'
  );
}

export function isQuoteConvertible(status: QuoteStatus): boolean {
  return status === 'accepted';
}

export function quoteCreatesBillingRecord(): false {
  return false;
}

export function assertQuoteIsNotBilling(): void {
  if (quoteCreatesBillingRecord()) {
    throw new DomainRuleError(
      'Quotes must not create billing records',
      'quotes.errors.quoteIsNotBilling',
    );
  }
}

export function quoteIsNotChangeOrder(): true {
  return true;
}
