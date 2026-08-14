import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import type { PurchaseOrderStatus } from './committed-cost';

/**
 * Quantity receiving against a purchase order.
 * Receiving is never Actual: no expense, vendor bill, or inventory movement.
 */

export type ReceivablePurchaseOrderStatus = Extract<
  PurchaseOrderStatus,
  'issued' | 'partially_received'
>;

const RECEIVABLE_STATUSES: readonly ReceivablePurchaseOrderStatus[] = [
  'issued',
  'partially_received',
];

export type QuantityLine = {
  readonly quantity: string;
  readonly receivedQuantity: string;
};

export function parseReceiveQuantity(raw: string): Decimal {
  const value = new Decimal(String(raw).trim() || '0');
  if (!value.isFinite()) {
    throw new DomainRuleError('Invalid receive quantity', 'procurement.errors.invalidReceiveQuantity');
  }
  return value;
}

/** remaining = ordered − received. Never negative for UI. Decimal math only. */
export function remainingQuantity(ordered: string, received: string): string {
  const remaining = parseReceiveQuantity(ordered).minus(parseReceiveQuantity(received));
  if (remaining.isNegative()) return '0';
  return remaining.toFixed();
}

export function withLineRemaining<T extends QuantityLine>(
  line: T,
): T & { remainingQuantity: string } {
  return { ...line, remainingQuantity: remainingQuantity(line.quantity, line.receivedQuantity) };
}

export function isPurchaseOrderReceivable(status: PurchaseOrderStatus): boolean {
  return (RECEIVABLE_STATUSES as readonly string[]).includes(status);
}

export function assertPurchaseOrderReceivable(status: PurchaseOrderStatus): void {
  if (!isPurchaseOrderReceivable(status)) {
    throw new DomainRuleError(
      `Cannot receive a ${status} purchase order`,
      'procurement.errors.cannotReceiveStatus',
      { status },
    );
  }
}

export function assertReceiveQuantityWithinRemaining(input: {
  readonly quantity: string;
  readonly remaining: string;
}): void {
  const quantity = parseReceiveQuantity(input.quantity);
  if (quantity.lte(0)) {
    throw new DomainRuleError(
      'Receive quantity must be greater than zero',
      'procurement.errors.invalidReceiveQuantity',
    );
  }
  const remaining = parseReceiveQuantity(input.remaining);
  if (quantity.gt(remaining)) {
    throw new DomainRuleError(
      'Quantity exceeds remaining',
      'procurement.errors.quantityExceedsRemaining',
      { remaining: remaining.toFixed() },
    );
  }
}

export function isPurchaseOrderFullyReceived(lines: readonly QuantityLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => parseReceiveQuantity(remainingQuantity(line.quantity, line.receivedQuantity)).eq(0));
}

/** Receiving must not post Actual (expense / AP / inventory). */
export function isReceivingActualExpense(): false {
  return false;
}
