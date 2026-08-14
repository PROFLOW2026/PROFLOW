/** Public API — pre-sale Quotes / Estimates (Quote ≠ Billing ≠ Change Order ≠ Revenue). */

export {
  createQuote,
  updateQuote,
  getQuoteDetail,
} from './application/manage-quotes';
export { listQuotesForOrg, getQuoteById } from './application/queries';
export { transitionQuoteStatus } from './application/transition-quote';
export { convertQuote } from './application/convert-quote';
export type { ConvertQuoteResult } from './application/convert-quote';

export {
  QUOTE_STATUSES,
  QUOTE_TAX_MODES,
  QUOTE_CONVERT_WORK_KINDS,
  QUOTES_AUDIT_ACTIONS,
} from './domain/types';
export type {
  QuoteStatus,
  QuoteTaxMode,
  QuoteConvertWorkKind,
  QuoteRecord,
  QuoteLineItemRecord,
  QuoteDetail,
  QuoteListItem,
} from './domain/types';

export {
  canTransitionQuoteStatus,
  assertCanTransitionQuoteStatus,
  isQuoteEditable,
  assertQuoteEditable,
  isQuoteTerminal,
  isQuoteConvertible,
  quoteCreatesBillingRecord,
  assertQuoteIsNotBilling,
  quoteIsNotChangeOrder,
} from './domain/lifecycle';

export {
  quoteDiscountAmountForApproval,
  isQuoteDiscountGateTransition,
} from './domain/discount';
export type { QuoteDiscountBasis, QuoteDiscountGateAmount } from './domain/discount';

export {
  computeQuoteTotals,
  computeEstimatedMarginPercent,
  computeLineMarkupPercent,
  computeLineMarginPercent,
  contractNetFromQuote,
  estimatedProfitPreview,
} from './domain/totals';

export {
  assertCanConvertQuote,
  isQuoteAlreadyConverted,
  resolveCompletedQuoteConversion,
  contractEnteredAmountFromQuote,
} from './domain/conversion';

export {
  createQuoteSchema,
  updateQuoteSchema,
  transitionQuoteSchema,
  convertQuoteSchema,
  listQuotesSchema,
  quoteLineSchema,
} from './validation/schemas';
export type {
  CreateQuoteInput,
  UpdateQuoteInput,
  TransitionQuoteInput,
  ConvertQuoteInput,
  ListQuotesInput,
} from './validation/schemas';
