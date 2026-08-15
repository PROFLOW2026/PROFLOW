/**
 * Storage paths are operational keys, never an authorization decision.
 * A version upload must still land under the logical document's tenant prefix
 * so a leaked key cannot be walked sideways into another organization.
 */

export function isDocumentOwnedStoragePath(
  organizationId: string,
  documentId: string,
  storagePath: string,
): boolean {
  const prefix = `${organizationId}/documents/${documentId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return Boolean(rest) && !rest.includes('/') && !rest.includes('\\') && !rest.includes('..');
}
