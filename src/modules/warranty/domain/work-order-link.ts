/**
 * Warranty service calls are a separate `work_kind=work_order` row.
 * Linking one must never reopen the original project.
 */

export function originalProjectStatusAfterWarrantyWorkOrder(status: string): string {
  return status;
}

export function mayCreateWarrantyWorkOrderWhileClosed(projectStatus: string): boolean {
  return projectStatus === 'completed' || projectStatus === 'active' || projectStatus === 'on_hold';
}

export function isWarrantyWorkOrderKind(workKind: string): boolean {
  return workKind === 'work_order';
}
