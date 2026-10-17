import { describe, expect, it } from 'vitest';
import { formatRetentionPercent } from '@/modules/vendors/domain/retention-percent-display';
import {
  formatSearchHitAmount,
  showGlobalSearchEmpty,
} from '@/modules/search/domain/hit-amount-label';
import { localizeCode } from '@/shared/i18n/code-display';
import { expenseAllowsFinalizeWithoutCategory } from '@/modules/expenses/domain/targeting';

describe('grok expense display fixes', () => {
  it('formats retention like the agreement card', () => {
    expect(formatRetentionPercent('5.000000')).toBe('5%');
    expect(formatRetentionPercent('5.500000')).toBe('5.5%');
    expect(formatRetentionPercent(null)).toBe('—');
    expect(formatRetentionPercent('')).toBe('—');
  });

  it('shows net and gross together when both are on the search hit', () => {
    const both = formatSearchHitAmount(
      { amount: '100.00', grossAmount: '118.00', currency: 'ILS' },
      'en',
      { net: 'Net', gross: 'Gross' },
    );
    expect(both).toContain('Net');
    expect(both).toContain('Gross');
    expect(both).toContain('100');
    expect(both).toContain('118');

    const netOnly = formatSearchHitAmount(
      { amount: '100.00', currency: 'ILS' },
      'en',
      { net: 'Net', gross: 'Gross' },
    );
    expect(netOnly).not.toContain('Gross');
  });

  it('shows search empty only after the request finishes', () => {
    expect(
      showGlobalSearchEmpty({
        pending: true,
        hasError: false,
        trimmedLength: 4,
        rowCount: 0,
      }),
    ).toBe(false);
    expect(
      showGlobalSearchEmpty({
        pending: false,
        hasError: false,
        trimmedLength: 4,
        rowCount: 0,
      }),
    ).toBe(true);
  });

  it('maps document status available in all locales', () => {
    expect(localizeCode('en', 'available')).toBe('Available');
    expect(localizeCode('he-IL', 'available')).toBe('זמין');
    expect(localizeCode('ar', 'available')).toBe('متاح');
    expect(localizeCode('ru', 'available')).toBe('Доступен');
  });

  it('keeps the project-expense category waiver used at approve', () => {
    expect(expenseAllowsFinalizeWithoutCategory({ projectId: 'prj' })).toBe(true);
    expect(expenseAllowsFinalizeWithoutCategory({ projectId: null })).toBe(false);
    expect(
      expenseAllowsFinalizeWithoutCategory({
        projectId: null,
        allocations: [{ targetType: 'project', projectId: 'prj' }],
      }),
    ).toBe(true);
  });
});
