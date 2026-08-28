import { describe, expect, it } from 'vitest';
import {
  inferExpenseTaxModeFromAmounts,
  resolveTaxAmounts,
} from '@/modules/expenses/domain/tax';
import {
  DEFAULT_EXPENSE_VAT_MODE,
  resolveExpenseVatMode,
} from '@/modules/expenses/domain/vat-mode';
import { expenseInputFromPayload } from '@/modules/recurring-drafts/domain/payload';
import type { ExpenseDraftPayload } from '@/modules/recurring-drafts/domain/types';
import { businessDate } from '@/shared/dates';

describe('expense VAT mode (0071 UX)', () => {
  const rate18 = { method: 'percentage' as const, ratePercent: '18' };

  it('defaults new expense capture to inclusive (כולל מע״מ)', () => {
    expect(resolveExpenseVatMode({ forCreate: true })).toBe(DEFAULT_EXPENSE_VAT_MODE);
    expect(DEFAULT_EXPENSE_VAT_MODE).toBe('inclusive');
  });

  it('inclusive mode: entered = gross, derives net and VAT', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1180',
      currency: 'ILS',
      vatMode: 'inclusive',
      resolved: rate18,
    });
    expect(amounts.grossAmount.amount).toBe('1180.000000');
    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
  });

  it('exclusive mode: entered = net, adds VAT', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1000',
      currency: 'ILS',
      vatMode: 'exclusive',
      resolved: rate18,
    });
    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
    expect(amounts.grossAmount.amount).toBe('1180.000000');
  });

  it('zero mode: VAT = 0, net = gross = entered', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1000',
      currency: 'ILS',
      vatMode: 'zero',
      resolved: rate18,
    });
    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount).toBeNull();
    expect(amounts.grossAmount.amount).toBe('1000.000000');
  });

  it('preserves stored vat_mode on edit inference', () => {
    expect(
      inferExpenseTaxModeFromAmounts({
        netAmount: '1000.000000',
        taxAmount: null,
        grossAmount: '1000.000000',
        vatMode: 'zero',
      }),
    ).toEqual({
      amount: '1000.000000',
      vatMode: 'zero',
      amountIncludesTax: false,
    });
  });

  it('switching edit mode recomputes amounts (exclusive → inclusive)', () => {
    const exclusive = resolveTaxAmounts({
      enteredAmount: '1000',
      currency: 'ILS',
      vatMode: 'exclusive',
      resolved: rate18,
    });
    const inclusive = resolveTaxAmounts({
      enteredAmount: exclusive.grossAmount.amount.replace(/\.0+$/, ''),
      currency: 'ILS',
      vatMode: 'inclusive',
      resolved: rate18,
    });
    expect(inclusive.netAmount.amount).toBe('1000.000000');
    expect(inclusive.taxAmount?.amount).toBe('180.000000');
  });

  it('recurring template passes vatMode to generated expense input', () => {
    const payload: ExpenseDraftPayload = {
      amount: '500',
      currency: 'ILS',
      vatMode: 'zero',
    };
    const input = expenseInputFromPayload(payload, businessDate('2026-08-01'));
    expect(input.vatMode).toBe('zero');
  });

  it('recurring template defaults missing vatMode to inclusive', () => {
    const input = expenseInputFromPayload(
      { amount: '200', currency: 'ILS' },
      businessDate('2026-08-01'),
    );
    expect(input.vatMode).toBe('inclusive');
  });

  it('insurance/fee category does not force VAT mode', () => {
    const withInsuranceCategory = resolveExpenseVatMode({
      vatMode: 'zero',
      forCreate: false,
    });
    expect(withInsuranceCategory).toBe('zero');
    expect(resolveExpenseVatMode({ forCreate: true })).toBe('inclusive');
  });

  it('profitability uses net only (zero mode has no tax)', () => {
    const amounts = resolveTaxAmounts({
      enteredAmount: '1000',
      currency: 'ILS',
      vatMode: 'zero',
    });
    expect(amounts.netAmount.amount).toBe(amounts.grossAmount.amount);
    expect(amounts.taxAmount).toBeNull();
  });
});
