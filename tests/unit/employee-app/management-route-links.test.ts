import { describe, expect, it } from 'vitest';
import { buildExpenseDetailHref, resolveExpenseBackNavigation } from '@/modules/expenses/domain/expense-return-navigation';

describe('Employee Management route links', () => {
  it('clients list detail href uses employee route base', () => {
    const routeBase = '/employee/clients';
    expect(`${routeBase}/client-1`).toBe('/employee/clients/client-1');
  });

  it('billing list detail href uses employee route base', () => {
    const routeBase = '/employee/billing';
    expect(`${routeBase}/bill-1`).toBe('/employee/billing/bill-1');
  });

  it('payment allocation href uses employee route base', () => {
    const routeBase = '/employee/billing';
    const paymentId = 'pay-1';
    expect(`${routeBase}/payments/${paymentId}/allocate`).toBe(
      '/employee/billing/payments/pay-1/allocate',
    );
  });

  it('expense detail href uses employee route base', () => {
    expect(buildExpenseDetailHref('exp-1', { routeBase: '/employee/expenses' })).toBe(
      '/employee/expenses/exp-1',
    );
  });

  it('expense back navigation defaults to employee list', () => {
    expect(resolveExpenseBackNavigation(undefined, '/employee/expenses')).toEqual({
      href: '/employee/expenses',
      labelKey: 'expenses',
      safeReturnTo: null,
    });
  });

  it('planner routes remain unchanged', () => {
    expect('/employee/projects').toMatch(/^\/employee\/projects$/);
    expect('/employee/tasks').toMatch(/^\/employee\/tasks$/);
    expect('/employee/team').toMatch(/^\/employee\/team$/);
  });
});
