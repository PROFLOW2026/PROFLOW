import { describe, expect, it } from 'vitest';
import { expenseInputFromPayload } from '@/modules/recurring-drafts/domain/payload';
import { resolveAutoFinalizeFromCreationMode } from '@/modules/recurring-drafts/application/resolve-expense-category';
import { businessDate } from '@/shared/dates';

describe('recurring expense auto-finalize defaults', () => {
  it('defaults creation mode to automatic actual', () => {
    expect(resolveAutoFinalizeFromCreationMode(undefined)).toBe(true);
    expect(resolveAutoFinalizeFromCreationMode('automatic')).toBe(true);
    expect(resolveAutoFinalizeFromCreationMode('draft')).toBe(false);
  });

  it('preserves zero VAT mode into generated expense input', () => {
    const input = expenseInputFromPayload(
      { amount: '800', currency: 'ILS', vatMode: 'zero' },
      businessDate('2026-01-01'),
    );
    expect(input.vatMode).toBe('zero');
    expect(input.amount).toBe('800');
  });
});
