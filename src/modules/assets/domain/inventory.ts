import Decimal from 'decimal.js';
import type { InventoryMovementType } from './types';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

const STORAGE_SCALE = 6;

export const REORDER_STATUSES = ['ok', 'at_reorder', 'below_reorder', 'no_reorder_level'] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

export const DEFAULT_INVENTORY_LOCATION_CODE = 'MAIN';
export const DEFAULT_INVENTORY_LOCATION_NAME_HE = 'ראשי';
export const DEFAULT_INVENTORY_LOCATION_NAME_EN = 'Main';

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

export function isZeroQuantity(value: string): boolean {
  return new Decimal(value).isZero();
}

export function sumQuantities(values: readonly string[]): string {
  return values
    .reduce((acc, value) => acc.plus(value), new Decimal(0))
    .toFixed(STORAGE_SCALE);
}

export function defaultInventoryLocationName(locale: string | null | undefined): string {
  const normalized = (locale ?? '').toLowerCase();
  return normalized.startsWith('he')
    ? DEFAULT_INVENTORY_LOCATION_NAME_HE
    : DEFAULT_INVENTORY_LOCATION_NAME_EN;
}

/**
 * Signed delta against a location (or header) quantity. Must not go negative.
 */
export function applySignedQuantityChange(currentQuantity: string, delta: string): string {
  const next = new Decimal(currentQuantity).plus(delta);
  if (next.isNegative()) {
    throw new Error('Insufficient quantity on hand');
  }
  return next.toFixed(STORAGE_SCALE);
}

/**
 * Location deltas for a qty-only movement. Header quantity is the sum of
 * location balances after these deltas — transfer leaves the header unchanged.
 */
export function locationDeltasForMovement(input: {
  readonly movementType: InventoryMovementType;
  readonly quantity: string;
}): { readonly fromDelta: string | null; readonly toDelta: string | null } {
  const qty = new Decimal(input.quantity);
  switch (input.movementType) {
    case 'receive':
    case 'return':
      if (qty.lte(0)) throw new Error('Movement quantity must be positive');
      return { fromDelta: null, toDelta: qty.toFixed(STORAGE_SCALE) };
    case 'issue':
      if (qty.lte(0)) throw new Error('Movement quantity must be positive');
      return { fromDelta: qty.negated().toFixed(STORAGE_SCALE), toDelta: null };
    case 'transfer':
      if (qty.lte(0)) throw new Error('Movement quantity must be positive');
      return {
        fromDelta: qty.negated().toFixed(STORAGE_SCALE),
        toDelta: qty.toFixed(STORAGE_SCALE),
      };
    case 'adjust':
      if (qty.isZero()) throw new Error('Adjustment quantity must be non-zero');
      if (qty.isPositive()) {
        return { fromDelta: null, toDelta: qty.toFixed(STORAGE_SCALE) };
      }
      return { fromDelta: qty.toFixed(STORAGE_SCALE), toDelta: null };
    default: {
      const _exhaustive: never = input.movementType;
      throw new Error(`Unknown movement type: ${_exhaustive}`);
    }
  }
}

/**
 * Applies a stock movement to on-hand quantity.
 * - receive / return: add
 * - issue: subtract (must not go negative)
 * - adjust: treat quantity as signed delta
 * - transfer: header unchanged (qty moves between locations)
 */
export function applyInventoryMovement(input: {
  readonly quantityOnHand: string;
  readonly movementType: InventoryMovementType;
  readonly quantity: string;
}): { nextQuantityOnHand: string } {
  const deltas = locationDeltasForMovement({
    movementType: input.movementType,
    quantity: input.quantity,
  });
  const net = new Decimal(deltas.fromDelta ?? '0').plus(deltas.toDelta ?? '0');
  const next = applySignedQuantityChange(input.quantityOnHand, net.toFixed(STORAGE_SCALE));
  return { nextQuantityOnHand: next };
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
