import { describe, expect, it } from 'vitest';
import { operatingSliceAfterStockLines } from '@/modules/ap/domain/inventory-stock-purchase';

describe('operatingSliceAfterStockLines', () => {
  it('keeps the full slice when the bill has no stock lines', () => {
    expect(
      operatingSliceAfterStockLines({
        sliceAmount: '100',
        billNetAmount: '100',
        stockLineNet: '0',
        currency: 'ILS',
      }).amount,
    ).toBe('100.000000');
  });

  it('removes the whole stock net from a fully allocated bill', () => {
    expect(
      operatingSliceAfterStockLines({
        sliceAmount: '100',
        billNetAmount: '100',
        stockLineNet: '40',
        currency: 'ILS',
      }).amount,
    ).toBe('60.000000');
  });

  it('removes only the stock share of a partial project slice', () => {
    expect(
      operatingSliceAfterStockLines({
        sliceAmount: '50',
        billNetAmount: '100',
        stockLineNet: '40',
        currency: 'ILS',
      }).amount,
    ).toBe('30.000000');
  });

  it('returns zero when the slice is entirely stock', () => {
    expect(
      operatingSliceAfterStockLines({
        sliceAmount: '40',
        billNetAmount: '40',
        stockLineNet: '40',
        currency: 'ILS',
      }).amount,
    ).toBe('0.000000');
  });
});
