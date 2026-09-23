import { describe, expect, it } from 'vitest';
import {
  resolveVendorExpenseActivityKind,
  resolveVendorExpensePaymentDisplay,
  vendorExpenseCountsTowardOutstanding,
} from '@/modules/vendors/domain/vendor-expense-activity-display';

describe('vendor expense activity display', () => {
  it('CASE 9: reversal rows show cancelled — never unpaid', () => {
    expect(
      resolveVendorExpensePaymentDisplay({
        kind: 'reversal',
        hasActiveReversal: false,
        grossAmount: '-11800',
        paymentStatus: null,
      }),
    ).toBe('cancelled');
  });

  it('original with active reversal shows cancelled payment display', () => {
    expect(
      resolveVendorExpensePaymentDisplay({
        kind: 'expense',
        hasActiveReversal: true,
        grossAmount: '11800',
        paymentStatus: 'upcoming',
      }),
    ).toBe('cancelled');
  });

  it('approved unpaid expense stays unpaid (not cancelled)', () => {
    expect(
      resolveVendorExpensePaymentDisplay({
        kind: 'expense',
        hasActiveReversal: false,
        grossAmount: '11800',
        paymentStatus: 'upcoming',
      }),
    ).toBe('unpaid');
  });

  it('reversal and reversed original are excluded from outstanding', () => {
    expect(
      vendorExpenseCountsTowardOutstanding({
        kind: 'reversal',
        hasActiveReversal: false,
        grossAmount: '-11800',
        status: 'finalized',
      }),
    ).toBe(false);
    expect(
      vendorExpenseCountsTowardOutstanding({
        kind: 'expense',
        hasActiveReversal: true,
        grossAmount: '11800',
        status: 'finalized',
      }),
    ).toBe(false);
  });

  it('classifies reversal vs adjustment vs expense', () => {
    expect(resolveVendorExpenseActivityKind({ voidsExpenseId: 'x', adjustsExpenseId: null })).toBe(
      'reversal',
    );
    expect(resolveVendorExpenseActivityKind({ voidsExpenseId: null, adjustsExpenseId: 'y' })).toBe(
      'adjustment',
    );
    expect(resolveVendorExpenseActivityKind({ voidsExpenseId: null, adjustsExpenseId: null })).toBe(
      'expense',
    );
  });
});
