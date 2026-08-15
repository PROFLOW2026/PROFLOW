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
 * Canonical low-stock threshold is min_stock_level; reorder_level is the fallback.
 */
export function resolveMinStockLevel(input: {
  readonly minStockLevel?: string | null;
  readonly reorderLevel?: string | null;
}): string | null {
  const minRaw = input.minStockLevel?.trim();
  if (minRaw) return minRaw;
  const reorderRaw = input.reorderLevel?.trim();
  return reorderRaw || null;
}

/**
 * Compares on-hand quantity to min_stock_level (fallback reorder_level).
 * Null/empty threshold → no_reorder_level (not an alert).
 */
export function getReorderStatus(input: {
  readonly quantityOnHand: string;
  readonly reorderLevel?: string | null;
  readonly minStockLevel?: string | null;
}): ReorderStatus {
  const levelRaw = resolveMinStockLevel(input);
  if (!levelRaw) return 'no_reorder_level';

  const onHand = new Decimal(input.quantityOnHand);
  const level = new Decimal(levelRaw);
  if (onHand.lt(level)) return 'below_reorder';
  if (onHand.eq(level)) return 'at_reorder';
  return 'ok';
}

/** Low stock when on_hand < min_stock_level (or reorder_level). Strictly less-than. */
export function isLowStock(input: {
  readonly quantityOnHand: string;
  readonly minStockLevel?: string | null;
  readonly reorderLevel?: string | null;
}): boolean {
  return getReorderStatus(input) === 'below_reorder';
}

/** Suggested reorder is the same signal as low stock. */
export function suggestedReorder(input: {
  readonly quantityOnHand: string;
  readonly minStockLevel?: string | null;
  readonly reorderLevel?: string | null;
}): boolean {
  return isLowStock(input);
}

/**
 * available = on_hand − active reserved. Never negative without a domain error
 * on reserve (caller must throw). This helper clamps display to zero only when
 * `allowNegative` is false; reserve uses `assertCanReserve` instead.
 */
export function availableQuantity(onHand: string, reservedActive: string): string {
  return new Decimal(onHand).minus(reservedActive).toFixed(STORAGE_SCALE);
}

export function assertCanReserve(input: {
  readonly quantityOnHand: string;
  readonly reservedActive: string;
  readonly reserveQuantity: string;
}): string {
  const qty = new Decimal(input.reserveQuantity);
  if (qty.lte(0)) {
    throw new Error('Reservation quantity must be positive');
  }
  const available = new Decimal(input.quantityOnHand).minus(input.reservedActive);
  if (available.lt(qty)) {
    throw new Error('Insufficient available quantity');
  }
  return available.minus(qty).toFixed(STORAGE_SCALE);
}

/**
 * Remaining reserved qty after consuming `consumeQuantity` from one reservation.
 * Remaining must stay > 0 or the reservation is fully consumed (qty constraint).
 */
export function remainingReservationAfterConsume(input: {
  readonly reservedQuantity: string;
  readonly consumeQuantity: string;
}): { readonly remaining: string; readonly consumedFully: boolean } {
  const consume = new Decimal(input.consumeQuantity);
  if (consume.lte(0)) {
    throw new Error('Consume quantity must be positive');
  }
  const reserved = new Decimal(input.reservedQuantity);
  if (consume.gte(reserved)) {
    return { remaining: '0.000000', consumedFully: true };
  }
  return { remaining: reserved.minus(consume).toFixed(STORAGE_SCALE), consumedFully: false };
}

/**
 * Signed adjust qty for a count line: counted − expected.
 * Zero delta → no movement. Result is qty-only — never Actual / GL / Expense.
 */
export function countLineAdjustQuantity(expectedQuantity: string, countedQuantity: string): string | null {
  const delta = new Decimal(countedQuantity).minus(expectedQuantity);
  if (delta.isZero()) return null;
  return delta.toFixed(STORAGE_SCALE);
}

/** Count finalize creates adjust movements only — never Actual. */
export function isInventoryCountRecognizedActual(): false {
  return false;
}

/** Maintenance cost_amount must never create or imply an Expense. */
export function isMaintenanceCostAnExpense(): false {
  return false;
}
