import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertPurchaseOrderReceivable,
  isPurchaseOrderFullyReceived,
  isPurchaseOrderReceivable,
  isReceivingActualExpense,
  remainingQuantity,
} from '@/modules/procurement/domain/receiving';

describe('PO receiving remaining quantity', () => {
  it('derives remaining as ordered minus received without floats', () => {
    expect(remainingQuantity('10', '0')).toBe('10');
    expect(remainingQuantity('10.5', '3.25')).toBe('7.25');
    expect(remainingQuantity('1.000000', '1')).toBe('0');
  });

  it('clamps negative remaining to zero for UI', () => {
    expect(remainingQuantity('2', '5')).toBe('0');
  });

  it('treats issued and partially_received as receivable', () => {
    expect(isPurchaseOrderReceivable('issued')).toBe(true);
    expect(isPurchaseOrderReceivable('partially_received')).toBe(true);
    expect(isPurchaseOrderReceivable('draft')).toBe(false);
    expect(isPurchaseOrderReceivable('cancelled')).toBe(false);
    expect(isPurchaseOrderReceivable('closed')).toBe(false);
  });

  it('blocks receive on cancelled, closed, and draft', () => {
    expect(() => assertPurchaseOrderReceivable('cancelled')).toThrow(DomainRuleError);
    expect(() => assertPurchaseOrderReceivable('closed')).toThrow(DomainRuleError);
    expect(() => assertPurchaseOrderReceivable('draft')).toThrow(DomainRuleError);
    expect(() => assertPurchaseOrderReceivable('issued')).not.toThrow();
  });

  it('is fully received only when every line remaining is zero', () => {
    expect(
      isPurchaseOrderFullyReceived([
        { quantity: '10', receivedQuantity: '10' },
        { quantity: '2', receivedQuantity: '2' },
      ]),
    ).toBe(true);
    expect(
      isPurchaseOrderFullyReceived([{ quantity: '10', receivedQuantity: '4' }]),
    ).toBe(false);
    expect(isPurchaseOrderFullyReceived([])).toBe(false);
  });

  it('never treats receiving as Actual', () => {
    expect(isReceivingActualExpense()).toBe(false);
  });
});
