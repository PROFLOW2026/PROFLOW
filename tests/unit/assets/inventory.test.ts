import { describe, expect, it } from 'vitest';
import {
  applyInventoryMovement,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  isMaintenanceCostAnExpense,
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
    ).toThrow(/negative/);
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
