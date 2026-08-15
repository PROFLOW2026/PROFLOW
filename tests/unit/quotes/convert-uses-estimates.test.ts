import { describe, expect, it } from 'vitest';
import { convertWonUsesEstimatesTable, PRODUCT_QUOTE_TABLE, productQuoteCreateHref } from '@/modules/quotes/domain/product-path';
import { convertQuoteSchema } from '@/modules/quotes/validation/schemas';

describe('convert uses product estimates', () => {
  it('names estimates as the owner-facing quote table', () => {
    expect(convertWonUsesEstimatesTable()).toBe('estimates');
    expect(PRODUCT_QUOTE_TABLE).toBe('estimates');
    expect(productQuoteCreateHref('01900000-0000-7000-8000-000000000001')).toBe(
      '/quotes/new?opportunityId=01900000-0000-7000-8000-000000000001',
    );
  });

  it('convertQuote schema identifies an estimates row, not crm_sales_quotes', () => {
    const parsed = convertQuoteSchema.parse({
      quoteId: '01900000-0000-7000-8000-000000000002',
      workKind: 'project',
    });
    expect(parsed.quoteId).toBe('01900000-0000-7000-8000-000000000002');
    expect(parsed.workKind).toBe('project');
  });
});
