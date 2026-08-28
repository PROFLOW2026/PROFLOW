import { describe, expect, it } from 'vitest';
import { expenseAttentionActionHref } from '@/modules/expenses/domain/expense-attention';
import {
  buildCurrentPathReturnTo,
  buildExpenseDetailHref,
  buildProjectReturnTo,
  parseSafeInternalReturnTo,
  resolveExpenseBackLabelKey,
  resolveExpenseBackNavigation,
} from '@/modules/expenses/domain/expense-return-navigation';

describe('expense return navigation', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const vendorId = '22222222-2222-4222-8222-222222222222';

  it('preserves global expenses list origin', () => {
    const returnTo = '/expenses';
    expect(parseSafeInternalReturnTo(returnTo)).toBe('/expenses');
    expect(buildExpenseDetailHref('exp-1', { returnTo })).toBe(
      '/expenses/exp-1?returnTo=%2Fexpenses',
    );
    expect(resolveExpenseBackNavigation(returnTo)).toEqual({
      href: '/expenses',
      labelKey: 'expenses',
      safeReturnTo: '/expenses',
    });
  });

  it('preserves filtered expenses origin including attention query', () => {
    const returnTo = '/expenses?unallocated=true';
    expect(parseSafeInternalReturnTo(returnTo)).toBe(returnTo);
    expect(resolveExpenseBackLabelKey(returnTo)).toBe('expensesAttention');
    expect(
      buildExpenseDetailHref('exp-1', { returnTo, focus: 'allocation' }),
    ).toBe('/expenses/exp-1?focus=allocation&returnTo=%2Fexpenses%3Funallocated%3Dtrue');
  });

  it('preserves dashboard attention flow back to filtered list', () => {
    const dashboardSampleHref = buildExpenseDetailHref('exp-1', {
      focus: 'allocation',
      returnTo: '/expenses?unallocated=true',
    });
    expect(dashboardSampleHref).toContain('focus=allocation');
    expect(dashboardSampleHref).toContain('returnTo=%2Fexpenses%3Funallocated%3Dtrue');
    expect(resolveExpenseBackNavigation('/expenses?unallocated=true').labelKey).toBe(
      'expensesAttention',
    );
  });

  it('preserves project financials origin', () => {
    const returnTo = buildProjectReturnTo(projectId, 'financials');
    expect(parseSafeInternalReturnTo(returnTo)).toBe(returnTo);
    expect(resolveExpenseBackLabelKey(returnTo)).toBe('projectFinancials');
    expect(
      buildExpenseDetailHref('exp-1', { returnTo }),
    ).toBe(
      `/expenses/exp-1?returnTo=${encodeURIComponent(returnTo)}`,
    );
  });

  it('preserves project expenses tab origin', () => {
    const returnTo = buildProjectReturnTo(projectId, 'expenses');
    expect(resolveExpenseBackLabelKey(returnTo)).toBe('projectExpenses');
  });

  it('preserves vendor origin when provided', () => {
    const returnTo = `/vendors/${vendorId}`;
    expect(parseSafeInternalReturnTo(returnTo)).toBe(returnTo);
    expect(resolveExpenseBackLabelKey(returnTo)).toBe('vendor');
  });

  it('falls back to /expenses for direct entry without returnTo', () => {
    expect(resolveExpenseBackNavigation(undefined)).toEqual({
      href: '/expenses',
      labelKey: 'expenses',
      safeReturnTo: null,
    });
  });

  it('blocks external and malicious returnTo values', () => {
    expect(parseSafeInternalReturnTo('https://evil.example/phish')).toBeNull();
    expect(parseSafeInternalReturnTo('http://evil.example/phish')).toBeNull();
    expect(parseSafeInternalReturnTo('//evil.example/phish')).toBeNull();
    expect(resolveExpenseBackNavigation('https://evil.example').href).toBe('/expenses');
  });

  it('keeps focus and returnTo together in attention action hrefs', () => {
    expect(
      expenseAttentionActionHref('exp-1', 'classification', {
        returnTo: '/expenses?attention=classification',
      }),
    ).toBe(
      '/expenses/exp-1?focus=classification&returnTo=%2Fexpenses%3Fattention%3Dclassification',
    );
  });

  it('accepts locale-prefixed internal returnTo and normalizes it', () => {
    expect(parseSafeInternalReturnTo('/he-IL/expenses?unallocated=true')).toBe(
      '/expenses?unallocated=true',
    );
  });

  it('builds current pathname + search for list drill-down', () => {
    const params = new URLSearchParams({ unallocated: 'true', dateFrom: '2026-01-01' });
    expect(buildCurrentPathReturnTo('/expenses', params)).toBe(
      '/expenses?unallocated=true&dateFrom=2026-01-01',
    );
  });
});
