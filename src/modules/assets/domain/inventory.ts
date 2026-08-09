import Decimal from 'decimal.js';
import type { InventoryMovementType } from './types';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

const STORAGE_SCALE = 6;

/**
 * Inventory quantity math. Explicitly not GL and not Expense — only
 * updates quantity_on_hand for operational stock tracking.
 */
export function isInventoryQuantityGlOrExpense(): false {
  return false;
}

export function normalizeQuantity(value: string): string {
  return new Decimal(value).toFixed(STORAGE_SCALE);
}

/**
 * Applies a stock movement to on-hand quantity.
 * - receive / return: add
 * - issue: subtract (must not go negative)
 * - adjust: treat quantity as signed delta
 */
export function applyInventoryMovement(input: {
  readonly quantityOnHand: string;
  readonly movementType: InventoryMovementType;
  readonly quantity: string;
}): { nextQuantityOnHand: string } {
  const onHand = new Decimal(input.quantityOnHand);
  const qty = new Decimal(input.quantity);
  if (qty.lte(0) && input.movementType !== 'adjust') {
    throw new Error('Movement quantity must be positive');
  }

  let next: Decimal;
  switch (input.movementType) {
    case 'receive':
    case 'return':
      next = onHand.plus(qty);
      break;
    case 'issue':
      next = onHand.minus(qty);
      if (next.isNegative()) {
        throw new Error('Insufficient quantity on hand');
      }
      break;
    case 'adjust':
      next = onHand.plus(qty);
      if (next.isNegative()) {
        throw new Error('Adjustment would make quantity negative');
      }
      break;
    default: {
      const _exhaustive: never = input.movementType;
      throw new Error(`Unknown movement type: ${_exhaustive}`);
    }
  }

  return { nextQuantityOnHand: next.toFixed(STORAGE_SCALE) };
}

/** Maintenance cost_amount must never create or imply an Expense. */
export function isMaintenanceCostAnExpense(): false {
  return false;
}
