import { describe, expect, it } from 'vitest';
import { changeOrderApprovedNetAmount } from '@/modules/commercial/domain/contract-value';

describe('changeOrderApprovedNetAmount', () => {
  it('uses quote subtotal so VAT never enters contract value / profit', () => {
    expect(
      changeOrderApprovedNetAmount({
        quoteVersion: {
          subtotalAmount: '1000.00',
          totalAmount: '1170.00',
          taxAmount: '170.00',
        },
        requestedAmount: '999.00',
      }),
    ).toBe('1000.00');
  });

  it('falls back to requestedAmount when no quote version is priced', () => {
    expect(
      changeOrderApprovedNetAmount({
        quoteVersion: null,
        requestedAmount: '250.00',
      }),
    ).toBe('250.00');
  });

  it('returns null when neither quote net nor requested amount exists', () => {
    expect(
      changeOrderApprovedNetAmount({
        quoteVersion: null,
        requestedAmount: null,
      }),
    ).toBeNull();
  });
});
