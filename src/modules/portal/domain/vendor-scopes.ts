import type { VendorPortalScope } from './types';
import { VENDOR_PORTAL_SCOPES } from './types';

const VENDOR_SCOPE_SET = new Set<string>(VENDOR_PORTAL_SCOPES);

export function isVendorPortalScope(value: string): value is VendorPortalScope {
  return VENDOR_SCOPE_SET.has(value);
}

export function normalizeVendorScopes(scopes: readonly string[]): VendorPortalScope[] {
  const unique = new Set<VendorPortalScope>();
  for (const scope of scopes) {
    if (isVendorPortalScope(scope)) unique.add(scope);
  }
  return [...unique];
}
