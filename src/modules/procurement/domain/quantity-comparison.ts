import Decimal from 'decimal.js';
import { parseReceiveQuantity } from './receiving';

/**
 * Ordered vs received vs invoiced quantity on an existing purchase order.
 * Informational only: does not block bill posting and does not create inventory.
 * Invoiced quantity is the sum of AP bill line quantities linked by
 * purchase_order_line_id on non-void bills (draft included).
 * Posted/open bills are open, partially_matched, and matched.
 */

const POSTED_OPEN_AP_BILL_STATUSES = new Set(['open', 'partially_matched', 'matched']);

export type ApBillLineQuantityContribution = {
  readonly purchaseOrderLineId: string;
  readonly quantity: string;
  readonly billStatus: string;
};

export type PurchaseOrderLineQuantityInput = {
  readonly lineId: string;
  readonly orderedQuantity: string;
  readonly receivedQuantity: string;
};

export type PurchaseOrderLineQuantityFlags = {
  readonly invoicedGreaterThanReceived: boolean;
  readonly receivedGreaterThanOrdered: boolean;
  /** Posted/open bill quantity while this line's received quantity is still zero. */
  readonly invoicedWithoutReceipt: boolean;
  readonly partialReceipt: boolean;
  readonly partialInvoice: boolean;
};

export type PurchaseOrderLineQuantityComparison = {
  readonly lineId: string;
  readonly orderedQuantity: string;
  readonly receivedQuantity: string;
  readonly invoicedQuantity: string;
  readonly flags: PurchaseOrderLineQuantityFlags;
};

function isPostedOpenApBillStatus(status: string): boolean {
  return POSTED_OPEN_AP_BILL_STATUSES.has(status);
}

function sumQuantities(values: readonly string[]): Decimal {
  return values.reduce(
    (total, value) => total.plus(parseReceiveQuantity(value)),
    new Decimal(0),
  );
}

function formatQuantity(value: Decimal): string {
  return value.toFixed();
}

export function comparePurchaseOrderLineQuantities(input: {
  readonly lines: readonly PurchaseOrderLineQuantityInput[];
  readonly billLines: readonly ApBillLineQuantityContribution[];
}): readonly PurchaseOrderLineQuantityComparison[] {
  const contributionsByLineId = new Map<string, ApBillLineQuantityContribution[]>();
  for (const billLine of input.billLines) {
    if (!billLine.purchaseOrderLineId || billLine.billStatus === 'void') continue;
    const current = contributionsByLineId.get(billLine.purchaseOrderLineId) ?? [];
    current.push(billLine);
    contributionsByLineId.set(billLine.purchaseOrderLineId, current);
  }

  return input.lines.map((line) => {
    const ordered = parseReceiveQuantity(line.orderedQuantity);
    const received = parseReceiveQuantity(line.receivedQuantity);
    const contributions = contributionsByLineId.get(line.lineId) ?? [];
    const invoiced = sumQuantities(contributions.map((row) => row.quantity));
    const postedInvoiced = sumQuantities(
      contributions
        .filter((row) => isPostedOpenApBillStatus(row.billStatus))
        .map((row) => row.quantity),
    );

    return {
      lineId: line.lineId,
      orderedQuantity: formatQuantity(ordered),
      receivedQuantity: formatQuantity(received),
      invoicedQuantity: formatQuantity(invoiced),
      flags: {
        invoicedGreaterThanReceived: invoiced.gt(received),
        receivedGreaterThanOrdered: received.gt(ordered),
        invoicedWithoutReceipt: received.eq(0) && postedInvoiced.gt(0),
        partialReceipt: received.gt(0) && received.lt(ordered),
        partialInvoice: invoiced.gt(0) && invoiced.lt(ordered),
      },
    };
  });
}
