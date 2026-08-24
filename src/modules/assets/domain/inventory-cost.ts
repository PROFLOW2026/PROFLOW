/**
 * Inventory managerial cost layers — FIFO remaining-qty burn.
 * Purchase linked to stock is stock-value state (not operating Actual).
 * Project consume / write-off create profit-affecting Actual once.
 */

import Decimal from 'decimal.js';
import {
  addMoney,
  money,
  multiplyMoney,
  roundMoney,
  subtractMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import { DomainRuleError, ValidationError } from '@/shared/errors';

export type InventoryCostLayerSourceKind = 'expense' | 'opening_balance';

export type InventoryCostConsumptionKind = 'project_consume' | 'writeoff' | 'adjust';

export interface InventoryCostConsumptionProjectShape {
  readonly kind: InventoryCostConsumptionKind;
  readonly projectId: string | null;
}

/** Validates project_consume vs writeoff/adjust project_id shape (mirrors SQL CHECK). */
export function assertInventoryCostConsumptionProjectShape(
  shape: InventoryCostConsumptionProjectShape,
): void {
  const { kind, projectId } = shape;
  if (kind === 'project_consume') {
    if (!projectId) {
      throw new ValidationError(
        [{ path: 'projectId', message: 'Required for project_consume' }],
        'Invalid inventory cost consumption project shape',
      );
    }
    return;
  }
  if (kind === 'writeoff' || kind === 'adjust') {
    if (projectId) {
      throw new ValidationError(
        [{ path: 'projectId', message: 'Write-off/adjust must not set projectId' }],
        'Invalid inventory cost consumption project shape',
      );
    }
    return;
  }
  throw new ValidationError(
    [{ path: 'kind', message: 'Unknown consumption kind' }],
    'Invalid inventory cost consumption project shape',
  );
}

export interface InventoryCostLayerSourceShape {
  readonly sourceKind: InventoryCostLayerSourceKind;
  readonly sourceExpenseId: string | null;
  readonly sourceApBillId: string | null;
  readonly openingReference: string | null;
}

/** Validates expense / AP / opening_balance source shape (mirrors SQL CHECK). */
export function assertInventoryCostLayerSourceShape(shape: InventoryCostLayerSourceShape): void {
  const { sourceKind, sourceExpenseId, sourceApBillId, openingReference } = shape;
  if (sourceKind === 'expense') {
    if (!sourceExpenseId || sourceApBillId) {
      throw new ValidationError(
        [{ path: 'sourceKind', message: 'expense requires sourceExpenseId only' }],
        'Invalid inventory cost layer source shape',
      );
    }
    return;
  }
  if (sourceKind === 'opening_balance') {
    const ref = openingReference?.trim() ?? '';
    if (sourceExpenseId || sourceApBillId || ref.length === 0) {
      throw new ValidationError(
        [{ path: 'openingReference', message: 'opening_balance requires openingReference only' }],
        'Invalid inventory cost layer source shape',
      );
    }
    return;
  }
  throw new ValidationError(
    [{ path: 'sourceKind', message: 'Unknown source kind' }],
    'Invalid inventory cost layer source shape',
  );
}

export interface InventoryCostLayerSlice {
  readonly id: string;
  readonly remainingQty: string;
  readonly unitCost: MoneyValue;
}

export interface InventoryConsumeAllocation {
  readonly layerId: string;
  readonly quantity: string;
  readonly amount: MoneyValue;
}

export interface InventoryConsumeResult {
  readonly allocations: readonly InventoryConsumeAllocation[];
  readonly totalAmount: MoneyValue;
  readonly remainingLayers: readonly InventoryCostLayerSlice[];
}

/**
 * Consume quantity from layers in receive order (FIFO).
 * Remaining stock value = Σ remaining_qty × unit_cost after consume.
 */
export function consumeInventoryCostFifo(input: {
  readonly layers: readonly InventoryCostLayerSlice[];
  readonly quantity: string;
  readonly currency: string;
}): InventoryConsumeResult {
  const qtyNeeded = new Decimal(input.quantity);
  if (!qtyNeeded.isFinite() || qtyNeeded.lte(0)) {
    throw new DomainRuleError('Consume quantity must be positive', 'assets.errors.consumeQty');
  }

  let remaining = qtyNeeded;
  const allocations: InventoryConsumeAllocation[] = [];
  const updated: InventoryCostLayerSlice[] = [];

  for (const layer of input.layers) {
    if (layer.unitCost.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new DomainRuleError('Layer currency mismatch', 'assets.errors.currencyMismatch');
    }
    const available = new Decimal(layer.remainingQty);
    if (available.lte(0) || remaining.lte(0)) {
      updated.push(layer);
      continue;
    }
    const take = Decimal.min(available, remaining);
    const amount = roundMoney(multiplyMoney(layer.unitCost, take.toFixed(6)));
    allocations.push({
      layerId: layer.id,
      quantity: take.toFixed(6),
      amount,
    });
    updated.push({
      id: layer.id,
      remainingQty: available.minus(take).toFixed(6),
      unitCost: layer.unitCost,
    });
    remaining = remaining.minus(take);
  }

  if (remaining.gt(0)) {
    throw new DomainRuleError(
      'Insufficient inventory cost basis for consume',
      'assets.errors.insufficientCostBasis',
    );
  }

  const totalAmount =
    allocations.length === 0
      ? money('0', input.currency)
      : roundMoney(
          allocations.slice(1).reduce((acc, row) => addMoney(acc, row.amount), allocations[0]!.amount),
        );

  return {
    allocations,
    totalAmount,
    remainingLayers: updated,
  };
}

export function inventoryLayerValue(layer: InventoryCostLayerSlice): MoneyValue {
  return roundMoney(multiplyMoney(layer.unitCost, layer.remainingQty));
}

export function sumInventoryStockValue(
  layers: readonly InventoryCostLayerSlice[],
  currency: string,
): MoneyValue {
  let total = money('0', currency);
  for (const layer of layers) {
    if (layer.unitCost.currency.toUpperCase() !== currency.toUpperCase()) continue;
    total = addMoney(total, inventoryLayerValue(layer));
  }
  return roundMoney(total);
}

/**
 * Cost-basis identity:
 * purchaseBasis ≈ projectConsumed + writeoffs + remainingStock
 */
export function inventoryCostBasisConserves(input: {
  readonly purchaseBasis: MoneyValue;
  readonly projectConsumed: MoneyValue;
  readonly writeoffs: MoneyValue;
  readonly remainingStock: MoneyValue;
}): boolean {
  const accounted = addMoney(
    addMoney(input.projectConsumed, input.writeoffs),
    input.remainingStock,
  );
  return (
    accounted.currency.toUpperCase() === input.purchaseBasis.currency.toUpperCase() &&
    toDecimalValue(accounted).minus(toDecimalValue(input.purchaseBasis)).abs().lte(0.000001)
  );
}

export function unitCostFromPurchase(input: {
  readonly netAmount: MoneyValue;
  readonly quantity: string;
}): MoneyValue {
  const qty = new Decimal(input.quantity);
  if (!qty.isFinite() || qty.lte(0)) {
    throw new DomainRuleError('Receive quantity must be positive', 'assets.errors.receiveQty');
  }
  const raw = toDecimalValue(input.netAmount).dividedBy(qty);
  return roundMoney(money(raw.toFixed(6), input.netAmount.currency));
}

export function reduceStockBasis(
  currentBasis: MoneyValue,
  consumed: MoneyValue,
): MoneyValue {
  const next = subtractMoney(currentBasis, consumed);
  if (toDecimalValue(next).isNegative()) {
    return money('0', currentBasis.currency);
  }
  return roundMoney(next);
}

/** True when FIFO burn or consumption rows exist — layer cannot be unbooked safely. */
export function inventoryCostLayerHasConsumptions(
  layer: { readonly receivedQty: string; readonly remainingQty: string },
  consumptionRowCount = 0,
): boolean {
  if (consumptionRowCount > 0) return true;
  const received = new Decimal(layer.receivedQty);
  const remaining = new Decimal(layer.remainingQty);
  if (!received.isFinite() || !remaining.isFinite()) return true;
  return remaining.lt(received);
}
