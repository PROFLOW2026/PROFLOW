import { describe, expect, it } from 'vitest';
import { resolveVendorExpenseCashPaid } from '@/modules/vendors/domain/vendor-expense-cash-paid';

describe('resolveVendorExpenseCashPaid', () => {
  it('uses installment totals when present', () => {
    const paid = resolveVendorExpenseCashPaid({
      kind: 'expense',
      hasActiveReversal: false,
      paymentStatus: 'paid',
      paidGrossAmount: '100',
      netAmount: '84.75',
      grossAmount: '100',
      installmentPaidGross: 50,
      installmentPaidNet: 42.37,
    });
    expect(paid.gross).toBe(50);
    expect(paid.net).toBe(42.37);
  });

  it('excludes replaced originals from paid totals', () => {
    const paid = resolveVendorExpenseCashPaid({
      kind: 'expense',
      hasActiveReversal: true,
      paymentStatus: 'paid',
      paidGrossAmount: '799',
      netAmount: '677.12',
      grossAmount: '799',
      installmentPaidGross: 0,
      installmentPaidNet: 0,
    });
    expect(paid.gross).toBe(0);
  });
});
