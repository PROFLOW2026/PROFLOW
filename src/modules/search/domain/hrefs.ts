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

export function warrantySearchHref(id: string, projectId?: string | null): string {
  if (projectId) return `/projects/${projectId}?tab=warranty`;
  return `/warranty/${id}`;
}

export function communicationSearchHref(id: string): string {
  return `/communications/${id}`;
}

export function calendarEventSearchHref(id: string): string {
  return `/calendar?event=${id}`;
}

export function closeoutSearchHref(projectId: string): string {
  return `/projects/${projectId}?tab=closeout`;
}

export function billingPlanSearchHref(projectId: string, planId?: string | null): string {
  const base = `/projects/${projectId}?tab=billingPlan`;
  return planId ? `${base}&planId=${planId}` : base;
}

export function billingCycleSearchHref(
  projectId: string,
  cycleId: string,
): string {
  return `/projects/${projectId}?tab=billingPlan&cycleId=${cycleId}`;
}

export function workEntityHref(workKind: string | null | undefined, id: string): string {
  if (workKind === 'job') return `/jobs/${id}`;
  if (workKind === 'work_order') return `/work-orders/${id}`;
  return `/projects/${id}`;
}
