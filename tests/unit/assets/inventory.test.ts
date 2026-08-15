import { describe, expect, it } from 'vitest';
import {
  applyInventoryMovement,
  applySignedQuantityChange,
  assertCanReserve,
  availableQuantity,
  countLineAdjustQuantity,
  defaultInventoryLocationName,
  DEFAULT_INVENTORY_LOCATION_NAME_EN,
  DEFAULT_INVENTORY_LOCATION_NAME_HE,
  getReorderStatus,
  isInventoryCountRecognizedActual,
  isInventoryQuantityGlOrExpense,
  isLowStock,
  isMaintenanceCostAnExpense,
  locationDeltasForMovement,
  remainingReservationAfterConsume,
  suggestedReorder,
  sumQuantities,
} from '@/modules/assets';

describe('applyInventoryMovement', () => {
  it('adds on receive and return', () => {
    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'receive',
        quantity: '2.5',
      }).nextQuantityOnHand,
    ).toBe('12.500000');

    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'return',
        quantity: '1',
      }).nextQuantityOnHand,
    ).toBe('11.000000');
  });

  it('subtracts on issue', () => {
    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'issue',
        quantity: '3',
      }).nextQuantityOnHand,
    ).toBe('7.000000');
  });

  it('rejects issue that would go negative', () => {
    expect(() =>
      applyInventoryMovement({
        quantityOnHand: '2',
        movementType: 'issue',
        quantity: '3',
      }),
    ).toThrow(/Insufficient/);
  });

  it('applies signed adjust deltas', () => {
    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'adjust',
        quantity: '-2',
      }).nextQuantityOnHand,
    ).toBe('8.000000');

    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'adjust',
        quantity: '1.5',
      }).nextQuantityOnHand,
    ).toBe('11.500000');
  });

  it('rejects zero adjust and negative-going adjust', () => {
    expect(() =>
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'adjust',
        quantity: '0',
      }),
    ).toThrow(/non-zero/);

    expect(() =>
      applyInventoryMovement({
        quantityOnHand: '1',
        movementType: 'adjust',
        quantity: '-2',
      }),
    ).toThrow(/negative|Insufficient/);
  });

  it('leaves header quantity unchanged on transfer', () => {
    expect(
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'transfer',
        quantity: '4',
      }).nextQuantityOnHand,
    ).toBe('10.000000');
  });

  it('rejects non-positive transfer quantity', () => {
    expect(() =>
      applyInventoryMovement({
        quantityOnHand: '10',
        movementType: 'transfer',
        quantity: '0',
      }),
    ).toThrow(/positive/);
  });
});

describe('location quantity math', () => {
  it('computes receive / issue / transfer / adjust deltas', () => {
    expect(locationDeltasForMovement({ movementType: 'receive', quantity: '2' })).toEqual({
      fromDelta: null,
      toDelta: '2.000000',
    });
    expect(locationDeltasForMovement({ movementType: 'issue', quantity: '2' })).toEqual({
      fromDelta: '-2.000000',
      toDelta: null,
    });
    expect(locationDeltasForMovement({ movementType: 'transfer', quantity: '2' })).toEqual({
      fromDelta: '-2.000000',
      toDelta: '2.000000',
    });
    expect(locationDeltasForMovement({ movementType: 'adjust', quantity: '-1.5' })).toEqual({
      fromDelta: '-1.500000',
      toDelta: null,
    });
  });

  it('blocks negative location balances', () => {
    expect(() => applySignedQuantityChange('2', '-3')).toThrow(/Insufficient/);
    expect(applySignedQuantityChange('2', '-2')).toBe('0.000000');
  });

  it('sums location quantities to the header', () => {
    expect(sumQuantities(['4.000000', '6.500000'])).toBe('10.500000');
  });

  it('names the lazy default location ראשי / Main', () => {
    expect(defaultInventoryLocationName('he-IL')).toBe(DEFAULT_INVENTORY_LOCATION_NAME_HE);
    expect(defaultInventoryLocationName('en')).toBe(DEFAULT_INVENTORY_LOCATION_NAME_EN);
  });
});

describe('getReorderStatus', () => {
  it('returns no_reorder_level when unset', () => {
    expect(
      getReorderStatus({ quantityOnHand: '5', reorderLevel: null }),
    ).toBe('no_reorder_level');
    expect(
      getReorderStatus({ quantityOnHand: '5', reorderLevel: '' }),
    ).toBe('no_reorder_level');
  });

  it('classifies ok / at / below', () => {
    expect(
      getReorderStatus({ quantityOnHand: '12', reorderLevel: '10' }),
    ).toBe('ok');
    expect(
      getReorderStatus({ quantityOnHand: '10', reorderLevel: '10' }),
    ).toBe('at_reorder');
    expect(
      getReorderStatus({ quantityOnHand: '9.5', reorderLevel: '10' }),
    ).toBe('below_reorder');
  });

  it('uses min_stock_level over reorder_level', () => {
    expect(
      getReorderStatus({
        quantityOnHand: '8',
        minStockLevel: '5',
        reorderLevel: '10',
      }),
    ).toBe('ok');
    expect(
      getReorderStatus({
        quantityOnHand: '4',
        minStockLevel: '5',
        reorderLevel: '10',
      }),
    ).toBe('below_reorder');
  });
});

describe('available and reserve math', () => {
  it('available is on_hand minus active reserved', () => {
    expect(availableQuantity('10', '3')).toBe('7.000000');
    expect(availableQuantity('10', '10')).toBe('0.000000');
  });

  it('cannot over-reserve past available', () => {
    expect(assertCanReserve({
      quantityOnHand: '10',
      reservedActive: '7',
      reserveQuantity: '3',
    })).toBe('0.000000');

    expect(() =>
      assertCanReserve({
        quantityOnHand: '10',
        reservedActive: '7',
        reserveQuantity: '4',
      }),
    ).toThrow(/available/i);
  });

  it('partial consume leaves remaining reservation qty', () => {
    expect(
      remainingReservationAfterConsume({
        reservedQuantity: '5',
        consumeQuantity: '2',
      }),
    ).toEqual({ remaining: '3.000000', consumedFully: false });
    expect(
      remainingReservationAfterConsume({
        reservedQuantity: '5',
        consumeQuantity: '5',
      }),
    ).toEqual({ remaining: '0.000000', consumedFully: true });
  });
});

describe('low stock helper', () => {
  it('is low stock when on_hand is strictly below min_stock_level', () => {
    expect(isLowStock({ quantityOnHand: '4', minStockLevel: '5' })).toBe(true);
    expect(isLowStock({ quantityOnHand: '5', minStockLevel: '5' })).toBe(false);
    expect(isLowStock({ quantityOnHand: '6', minStockLevel: '5' })).toBe(false);
  });

  it('falls back to reorder_level and treats suggested reorder as low stock', () => {
    expect(isLowStock({ quantityOnHand: '1', reorderLevel: '2' })).toBe(true);
    expect(suggestedReorder({ quantityOnHand: '1', reorderLevel: '2' })).toBe(true);
    expect(isLowStock({ quantityOnHand: '4', minStockLevel: null, reorderLevel: null })).toBe(
      false,
    );
  });
});

describe('stock count adjust is not Actual', () => {
  it('emits signed adjust qty from counted minus expected', () => {
    expect(countLineAdjustQuantity('10', '8')).toBe('-2.000000');
    expect(countLineAdjustQuantity('10', '12')).toBe('2.000000');
    expect(countLineAdjustQuantity('10', '10')).toBeNull();
  });

  it('count finalize is never Actual', () => {
    expect(isInventoryCountRecognizedActual()).toBe(false);
    expect(isInventoryQuantityGlOrExpense()).toBe(false);
  });
});

describe('financial hard rules', () => {
  it('inventory quantity is not GL or Expense', () => {
    expect(isInventoryQuantityGlOrExpense()).toBe(false);
  });

  it('maintenance cost is not an Expense', () => {
    expect(isMaintenanceCostAnExpense()).toBe(false);
  });
});

describe('usage non-Actual invariant', () => {
  it('material and equipment usage never recognize Actual', async () => {
    const {
      doesUsageCreatePurchaseActual,
      isEquipmentUsageRecognizedActual,
      isMaterialUsageRecognizedActual,
      hasEquipmentUsageMetric,
      assertUsageDateRange,
    } = await import('@/modules/assets');

    expect(isMaterialUsageRecognizedActual()).toBe(false);
    expect(isEquipmentUsageRecognizedActual()).toBe(false);
    expect(doesUsageCreatePurchaseActual()).toBe(false);
    expect(hasEquipmentUsageMetric({ hours: '2' })).toBe(true);
    expect(hasEquipmentUsageMetric({})).toBe(false);
    expect(() => assertUsageDateRange('2026-08-10', '2026-08-09')).toThrow(/end date/i);
    expect(() => assertUsageDateRange('2026-08-10', '2026-08-11')).not.toThrow();
  });
});
