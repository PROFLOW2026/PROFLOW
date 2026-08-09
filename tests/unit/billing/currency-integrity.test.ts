import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import { aggregateBillingPositionInCurrency } from '@/modules/billing/domain/outstanding';
import { assertBillingCurrencyMatchesProject } from '@/modules/billing/domain/currency';

describe('billing currency integrity', () => {
  it('rejects a billing currency that differs from the project currency', () => {
    expect(() => assertBillingCurrencyMatchesProject('USD', 'ILS')).toThrow(DomainRuleError);
  });

  it('excludes foreign-currency records instead of throwing during aggregation', () => {
    const position = aggregateBillingPositionInCurrency(
      [
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: money('5000', 'ILS'),
          payments: [],
        },
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: money('1000', 'USD'),
          payments: [],
        },
      ],
      'ILS',
    );

    expect(position.invoiced.amount).toBe('5000.000000');
    expect(position.excludedForeignCurrencyRecordCount).toBe(1);
    expect(position.hasBillingData).toBe(true);
  });
});
