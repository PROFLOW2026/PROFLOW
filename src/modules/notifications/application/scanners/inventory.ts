import { listLowStockItems } from '@/modules/assets';
import type { OrgContext } from '@/shared/auth/context';

/**
 * Low-stock scanner source for the notifications engine.
 * Canonical threshold is min_stock_level (fallback reorder_level).
 * on_hand < threshold; suggestedReorder is always true for returned rows.
 * Qty-only - never Actual / GL / FIFO.
 */
export interface InventoryLowStockScanRow {
  readonly id: string;
  readonly reference: string;
  readonly extra: string;
  readonly deepLink: string;
}

export async function scanLowStockItems(
  context: OrgContext,
  cap = 15,
): Promise<readonly InventoryLowStockScanRow[]> {
  const items = await listLowStockItems(context);
  return items.slice(0, cap).map((item) => ({
    id: item.id,
    reference: item.name,
    extra: `${item.quantityOnHand} < ${item.minStockLevel}`,
    deepLink: `/assets/inventory/${item.id}`,
  }));
}
