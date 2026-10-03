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

/** Deep-link to a task detail page. Route built by Agent B. */
export function taskSearchHref(id: string): string {
  return `/tasks/${id}`;
}

export function clientSearchHref(id: string): string {
  return `/clients/${id}`;
}

export function vendorSearchHref(id: string): string {
  return `/vendors/${id}`;
}

export function billingRecordSearchHref(id: string): string {
  return `/billing/${id}`;
}

export function apBillSearchHref(id: string): string {
  return `/procurement/ap/${id}`;
}

export function quoteSearchHref(id: string): string {
  return `/quotes/${id}`;
}

/** Documents have no detail route; the org list filters by filename. */
export function documentSearchHref(filename: string): string {
  return `/documents?q=${encodeURIComponent(filename)}`;
}

export function employeeSearchHref(id: string): string {
  return `/workforce/employees/${id}`;
}

export function contractSearchHref(projectId: string): string {
  return `/projects/${projectId}?tab=contracts`;
}

export function expenseSearchHref(id: string): string {
  return `/expenses/${id}`;
}

export function purchaseOrderSearchHref(id: string): string {
  return `/procurement/po/${id}`;
}

/** Agreement the contractors list already opens. */
export function contractorSearchHref(projectId: string, agreementId: string): string {
  return `/projects/${projectId}/contractors/${agreementId}/changes`;
}

export function coordinationEventSearchHref(projectId: string, eventId: string): string {
  return `/projects/${projectId}/coordination/${eventId}`;
}

export function claimSearchHref(projectId: string, claimId: string): string {
  return `/projects/${projectId}/claims/${claimId}`;
}

export function rfiSearchHref(projectId: string, rfiId: string): string {
  return `/projects/${projectId}/rfi/${rfiId}`;
}

export function submittalSearchHref(projectId: string, submittalId: string): string {
  return `/projects/${projectId}/submittals/${submittalId}`;
}

export function defectSearchHref(projectId: string, defectId: string): string {
  return `/projects/${projectId}/defects/${defectId}`;
}

export function drawingSearchHref(projectId: string, drawingId: string): string {
  return `/projects/${projectId}/plans/${drawingId}`;
}

/** Structure page is the location surface the viewer can open. */
export function locationSearchHref(projectId: string): string {
  return `/projects/${projectId}/structure`;
}

export function meetingSearchHref(projectId: string, meetingId: string): string {
  return `/projects/${projectId}/site-meetings/${meetingId}`;
}

export function siteInstructionSearchHref(projectId: string, instructionId: string): string {
  return `/projects/${projectId}/instructions/${instructionId}`;
}
