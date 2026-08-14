import { describe, expect, it } from 'vitest';
import {
  applyInventoryMovement,
  applySignedQuantityChange,
  defaultInventoryLocationName,
  DEFAULT_INVENTORY_LOCATION_NAME_EN,
  DEFAULT_INVENTORY_LOCATION_NAME_HE,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  isMaintenanceCostAnExpense,
  locationDeltasForMovement,
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
