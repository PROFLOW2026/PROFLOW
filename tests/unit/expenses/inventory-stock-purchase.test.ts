import { describe, expect, it } from 'vitest';
import { createExpenseSchema } from '@/modules/expenses/validation/schemas';
import {
  inventoryCostBasisConserves,
  inventoryCostLayerHasConsumptions,
  unitCostFromPurchase,
} from '@/modules/assets/domain/inventory-cost';
import { money, toNumericString } from '@/shared/money';

const ITEM_ID = '33333333-3333-4333-8333-333333333333';

const basePayload = {
  amount: '1000',
  currency: 'ILS',
  inventoryStockPurchase: true,
  inventoryItemId: ITEM_ID,
  inventoryPurchaseQty: '10',
};

describe('inventory stock purchase expense capture', () => {
  it('requires item and quantity when inventoryStockPurchase is true', () => {
    const missingItem = createExpenseSchema.safeParse({
      ...basePayload,
      inventoryItemId: null,
    });
    expect(missingItem.success).toBe(false);

    const missingQty = createExpenseSchema.safeParse({
      ...basePayload,
      inventoryPurchaseQty: '',
    });
    expect(missingQty.success).toBe(false);
  });

  it('accepts stock purchase when item and positive quantity are provided', () => {
    const parsed = createExpenseSchema.safeParse(basePayload);
    expect(parsed.success).toBe(true);
  });

  it('does not require item/qty when flag is false', () => {
    const parsed = createExpenseSchema.safeParse({
      amount: '100',
      currency: 'ILS',
      inventoryStockPurchase: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('inventory stock purchase booking invariants', () => {
  it('purchase net equals unit cost × qty and conserves through consume', () => {
    const net = money('1000', 'ILS');
    const quantity = '10';
    const unitCost = unitCostFromPurchase({ netAmount: net, quantity });
    expect(toNumericString(unitCost)).toBe('100.000000');

    const consumed = money('400', 'ILS');
    const remainingStock = money('600', 'ILS');
    expect(
      inventoryCostBasisConserves({
        purchaseBasis: net,
        projectConsumed: consumed,
        writeoffs: money('0', 'ILS'),
        remainingStock,
      }),
    ).toBe(true);
  });

  it('stock purchase void/reversal blocked after any FIFO burn', () => {
    expect(
      inventoryCostLayerHasConsumptions(
        { receivedQty: '10.000000', remainingQty: '0.000000' },
        0,
      ),
    ).toBe(true);
    expect(
      inventoryCostLayerHasConsumptions(
        { receivedQty: '10.000000', remainingQty: '10.000000' },
        0,
      ),
    ).toBe(false);
  });
});
