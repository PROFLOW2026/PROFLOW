import { describe, expect, it } from 'vitest';
import { displayedPayrollAmount } from '@/modules/workforce/domain/payroll-obligation';

describe('displayedPayrollAmount', () => {
  it('shows the corrected paid amount after a manual cost alignment', () => {
    expect(
      displayedPayrollAmount({
        paidAt: '2026-10-11',
        paidAmount: '8205.000000',
        expectedAmount: '8250.000000',
      }),
    ).toBe('8205.000000');
  });

  it('shows the expected amount while the month is still unpaid', () => {
    expect(
      displayedPayrollAmount({
        paidAt: null,
        paidAmount: null,
        expectedAmount: '33000.000000',
      }),
    ).toBe('33000.000000');
  });
});
