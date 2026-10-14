import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { findProductQuoteBySourceCrmQuoteId } from '@/modules/quotes';

/**
 * CRM sales quotes become read-only after bridge conversion to a product quote.
 */
export async function assertSalesQuoteNotConverted(
  context: OrgContext,
  salesQuoteId: string,
): Promise<void> {
  const productQuote = await findProductQuoteBySourceCrmQuoteId(
    context.db,
    context.organizationId,
    salesQuoteId,
  );
  if (productQuote) {
    throw new DomainRuleError(
      'CRM sales quote was already converted to a product quote',
      'crm.errors.quoteAlreadyConverted',
      { productQuoteId: productQuote.id },
    );
  }
}
