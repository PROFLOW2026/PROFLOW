/**
 * Suggest a purchase order from vendor + optional project + order number.
 * Matching is advisory. Confirm still creates a draft only.
 */

export interface PurchaseOrderSuggestionRow {
  readonly purchaseOrderId: string;
  readonly reference: string | null;
  readonly projectId: string | null;
  readonly status: string;
  readonly strength: 'order_number' | 'vendor_project' | 'vendor_open';
}

export interface PurchaseOrderMatchProbe {
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly orderNumber: string | null;
}

export interface PurchaseOrderIndexRow {
  readonly id: string;
  readonly vendorId: string;
  readonly projectId: string | null;
  readonly reference: string | null;
  readonly status: string;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function suggestPurchaseOrders(
  probe: PurchaseOrderMatchProbe,
  rows: readonly PurchaseOrderIndexRow[],
): PurchaseOrderSuggestionRow[] {
  const open = rows.filter((row) => row.status === 'issued' || row.status === 'partially_received');
  const orderNumber = norm(probe.orderNumber);
  const hits: PurchaseOrderSuggestionRow[] = [];

  if (orderNumber) {
    for (const row of open) {
      if (norm(row.reference) === orderNumber) {
        hits.push({
          purchaseOrderId: row.id,
          reference: row.reference,
          projectId: row.projectId,
          status: row.status,
          strength: 'order_number',
        });
      }
    }
  }

  if (probe.vendorId && probe.projectId) {
    for (const row of open) {
      if (row.vendorId === probe.vendorId && row.projectId === probe.projectId) {
        if (hits.some((hit) => hit.purchaseOrderId === row.id)) continue;
        hits.push({
          purchaseOrderId: row.id,
          reference: row.reference,
          projectId: row.projectId,
          status: row.status,
          strength: 'vendor_project',
        });
      }
    }
  }

  if (probe.vendorId && hits.length === 0) {
    for (const row of open) {
      if (row.vendorId !== probe.vendorId) continue;
      hits.push({
        purchaseOrderId: row.id,
        reference: row.reference,
        projectId: row.projectId,
        status: row.status,
        strength: 'vendor_open',
      });
    }
  }

  return hits.slice(0, 5);
}
