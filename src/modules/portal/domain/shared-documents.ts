/**
 * Customer document share rules for the portal.
 *
 * Prefer `document_links.portal_visible = true` (schema default false).
 * Interim: exact / prefixed `portal-shared` labels still count until all
 * shares are migrated to the column.
 */

export const CUSTOMER_PORTAL_SHARED_LABEL = 'portal-shared' as const;

export function isCustomerPortalSharedLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const trimmed = label.trim().toLowerCase();
  return (
    trimmed === CUSTOMER_PORTAL_SHARED_LABEL ||
    trimmed.startsWith(`${CUSTOMER_PORTAL_SHARED_LABEL}:`)
  );
}

export function isCustomerPortalSharedDocument(row: {
  label: string | null;
  portalVisible?: boolean | null;
}): boolean {
  if (row.portalVisible === true) return true;
  return isCustomerPortalSharedLabel(row.label);
}

export function filterCustomerPortalSharedDocuments<
  T extends { label: string | null; portalVisible?: boolean | null },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => isCustomerPortalSharedDocument(row));
}
