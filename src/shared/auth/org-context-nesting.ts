/**
 * Nested `runInOrgContext` may reuse the current request tx frame only when the
 * caller's target organization matches the frame's snapshot. A mismatch must
 * open a fresh authz context (multi-org switcher badges, etc.).
 */
export function canReuseNestedOrgRequestFrame(
  nestedOrganizationId: string | undefined,
  targetOrganizationId: string,
): boolean {
  return nestedOrganizationId != null && nestedOrganizationId === targetOrganizationId;
}
