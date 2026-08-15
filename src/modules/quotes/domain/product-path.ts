/**
 * Owner-facing commercial bid / estimate path.
 * `/quotes` writes `estimates`. CRM `crm_sales_quotes` / `crm_estimates` are internal.
 * In-project commercial quotes stay on `/changes/.../price`.
 */

export const PRODUCT_QUOTE_TABLE = 'estimates' as const;
export const PRODUCT_QUOTE_PATH = '/quotes' as const;

export function productQuoteCreateHref(opportunityId?: string | null): string {
  if (!opportunityId) return `${PRODUCT_QUOTE_PATH}/new`;
  return `${PRODUCT_QUOTE_PATH}/new?opportunityId=${encodeURIComponent(opportunityId)}`;
}

export function productQuoteDetailHref(quoteId: string): string {
  return `${PRODUCT_QUOTE_PATH}/${quoteId}`;
}

export function convertWonUsesEstimatesTable(): typeof PRODUCT_QUOTE_TABLE {
  return PRODUCT_QUOTE_TABLE;
}
