import Decimal from 'decimal.js';
import type { InventoryMovementType } from './types';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

const STORAGE_SCALE = 6;

export const REORDER_STATUSES = ['ok', 'at_reorder', 'below_reorder', 'no_reorder_level'] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

/**
 * Inventory quantity math. Explicitly not GL and not Expense — only
 * updates quantity_on_hand for operational stock tracking.
 * App-layer org filters + RLS on inventory_* tables; never post Expense from movements.
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
  if (input.movementType === 'adjust') {
    if (qty.isZero()) {
      throw new Error('Adjustment quantity must be non-zero');
    }
  } else if (qty.lte(0)) {
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

/**
 * Compares on-hand quantity to reorder_level for operational alerts.
 * Null/empty reorder level → no_reorder_level (not an alert).
 */
export function getReorderStatus(input: {
  readonly quantityOnHand: string;
  readonly reorderLevel: string | null | undefined;
}): ReorderStatus {
  const levelRaw = input.reorderLevel?.trim();
  if (!levelRaw) return 'no_reorder_level';

  const onHand = new Decimal(input.quantityOnHand);
  const level = new Decimal(levelRaw);
  if (onHand.lt(level)) return 'below_reorder';
  if (onHand.eq(level)) return 'at_reorder';
  return 'ok';
}

/** Maintenance cost_amount must never create or imply an Expense. */
export function isMaintenanceCostAnExpense(): false {
  return false;
}
