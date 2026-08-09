import { describe, expect, it } from 'vitest';
import { resolveTaxAmounts } from '@/modules/expenses/domain/tax';

describe('expense tax resolution', () => {
  it('derives net from gross minus tax when only gross and tax are supplied', () => {
    const amounts = resolveTaxAmounts({
      grossAmount: '1180',
      taxAmount: '180',
      currency: 'ILS',
    });

    expect(amounts.netAmount.amount).toBe('1000.000000');
    expect(amounts.taxAmount?.amount).toBe('180.000000');
    expect(amounts.grossAmount.amount).toBe('1180.000000');
  });
});
