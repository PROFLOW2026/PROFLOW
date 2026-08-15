/**
 * Permission-safe search result hrefs. Inventory items live under
 * `/assets/inventory/{id}`; fleet/equipment assets under `/assets/{id}`.
 */

export function assetSearchHref(id: string): string {
  return `/assets/${id}`;
}

export function inventoryItemSearchHref(id: string): string {
  return `/assets/inventory/${id}`;
}

export function materialSearchHref(id: string): string {
  return `/procurement/materials/${id}`;
}
