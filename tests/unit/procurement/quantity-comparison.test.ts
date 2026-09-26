import { describe, expect, it } from 'vitest';
import { comparePurchaseOrderLineQuantities } from '@/modules/procurement/domain/quantity-comparison';

const line = {
  lineId: 'line-1',
  orderedQuantity: '10',
  receivedQuantity: '4',
};

describe('comparePurchaseOrderLineQuantities', () => {
  it('sums non-void bill quantities with decimal math and ignores void and other lines', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [{ lineId: 'line-1', orderedQuantity: '10', receivedQuantity: '0' }],
      billLines: [
        { purchaseOrderLineId: 'line-1', quantity: '0.1', billStatus: 'draft' },
        { purchaseOrderLineId: 'line-1', quantity: '0.2', billStatus: 'open' },
        { purchaseOrderLineId: 'line-1', quantity: '9', billStatus: 'void' },
        { purchaseOrderLineId: 'line-2', quantity: '5', billStatus: 'open' },
      ],
    });

    expect(compared?.invoicedQuantity).toBe('0.3');
    expect(compared?.orderedQuantity).toBe('10');
    expect(compared?.receivedQuantity).toBe('0');
  });

  it('flags invoiced greater than received without throwing', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [line],
      billLines: [{ purchaseOrderLineId: 'line-1', quantity: '6', billStatus: 'matched' }],
    });

    expect(compared?.flags.invoicedGreaterThanReceived).toBe(true);
    expect(compared?.flags.invoicedWithoutReceipt).toBe(false);
  });

  it('flags received greater than ordered', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [{ lineId: 'line-1', orderedQuantity: '10', receivedQuantity: '12' }],
      billLines: [],
    });

    expect(compared?.flags.receivedGreaterThanOrdered).toBe(true);
    expect(compared?.flags.partialReceipt).toBe(false);
    expect(compared?.invoicedQuantity).toBe('0');
  });

  it('flags a posted or open bill while received quantity is still zero', () => {
    for (const billStatus of ['open', 'partially_matched', 'matched'] as const) {
      const [compared] = comparePurchaseOrderLineQuantities({
        lines: [{ lineId: 'line-1', orderedQuantity: '10', receivedQuantity: '0' }],
        billLines: [{ purchaseOrderLineId: 'line-1', quantity: '2', billStatus }],
      });
      expect(compared?.flags.invoicedWithoutReceipt).toBe(true);
      expect(compared?.flags.invoicedGreaterThanReceived).toBe(true);
    }
  });

  it('does not treat a draft bill as invoiced without receipt', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [{ lineId: 'line-1', orderedQuantity: '10', receivedQuantity: '0' }],
      billLines: [{ purchaseOrderLineId: 'line-1', quantity: '2', billStatus: 'draft' }],
    });

    expect(compared?.invoicedQuantity).toBe('2');
    expect(compared?.flags.invoicedGreaterThanReceived).toBe(true);
    expect(compared?.flags.invoicedWithoutReceipt).toBe(false);
  });

  it('flags partial receipt and partial invoice', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [{ lineId: 'line-1', orderedQuantity: '10', receivedQuantity: '4' }],
      billLines: [{ purchaseOrderLineId: 'line-1', quantity: '3', billStatus: 'open' }],
    });

    expect(compared?.flags.partialReceipt).toBe(true);
    expect(compared?.flags.partialInvoice).toBe(true);
    expect(compared?.flags.invoicedGreaterThanReceived).toBe(false);
    expect(compared?.flags.receivedGreaterThanOrdered).toBe(false);
    expect(compared?.flags.invoicedWithoutReceipt).toBe(false);
  });

  it('raises no flags when ordered, received, and invoiced match', () => {
    const [compared] = comparePurchaseOrderLineQuantities({
      lines: [{ lineId: 'line-1', orderedQuantity: '10.00', receivedQuantity: '10' }],
      billLines: [
        { purchaseOrderLineId: 'line-1', quantity: '4', billStatus: 'open' },
        { purchaseOrderLineId: 'line-1', quantity: '6', billStatus: 'matched' },
      ],
    });

    expect(compared?.invoicedQuantity).toBe('10');
    expect(compared?.flags).toEqual({
      invoicedGreaterThanReceived: false,
      receivedGreaterThanOrdered: false,
      invoicedWithoutReceipt: false,
      partialReceipt: false,
      partialInvoice: false,
    });
  });
});
