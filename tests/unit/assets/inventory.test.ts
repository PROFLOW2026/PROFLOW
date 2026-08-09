import { describe, expect, it } from 'vitest';
import {
  applyInventoryMovement,
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
