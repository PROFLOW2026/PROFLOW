import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { resolveExpenseCurrency } from '@/modules/expenses/domain/currency';

describe('expense currency resolution', () => {
  const orgContext = { baseCurrency: 'ILS' };

  it('accepts the organization base currency for overhead expenses', () => {
    expect(
      resolveExpenseCurrency(orgContext, { mode: 'overhead', projectId: null }, null, 'ILS'),
    ).toBe('ILS');
  });

  it('rejects a foreign currency on overhead expenses', () => {
    expect(() =>
      resolveExpenseCurrency(orgContext, { mode: 'overhead', projectId: null }, null, 'USD'),
    ).toThrow(DomainRuleError);
  });

  it('accepts the project currency for project expenses', () => {
    expect(
      resolveExpenseCurrency(
        orgContext,
        { mode: 'project', projectId: 'p1' },
        'ILS',
        'ILS',
      ),
    ).toBe('ILS');
  });

  it('falls back to organization base currency when the project has no currency', () => {
    expect(
      resolveExpenseCurrency(
        orgContext,
        { mode: 'project', projectId: 'p1' },
        null,
        'ILS',
      ),
    ).toBe('ILS');
  });

  it('rejects a currency that does not match the project', () => {
    expect(() =>
      resolveExpenseCurrency(
        orgContext,
        { mode: 'project', projectId: 'p1' },
        'ILS',
        'USD',
      ),
    ).toThrow(DomainRuleError);
  });
});
