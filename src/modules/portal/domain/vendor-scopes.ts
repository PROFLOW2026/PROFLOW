import type { VendorPortalScope } from './types';
import { VENDOR_PORTAL_SCOPES } from './types';
import { DomainRuleError } from '@/shared/errors';

const VENDOR_SCOPE_SET = new Set<string>(VENDOR_PORTAL_SCOPES);

/** Scopes that would imply mutating financial truth - never grantable to vendors. */
const FORBIDDEN_VENDOR_SCOPE_PATTERNS = [
  /write/i,
  /manage/i,
  /create/i,
  /delete/i,
  /expense/i,
  /billing\.write/i,
  /ap\./i,
  /cost/i,
  /** Allow read-only `payment.outstanding`; block payment mutation scopes. */
  /payment\.(write|manage|create|record|void)/i,
  /^payments$/i,
];

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

/**
 * ExternalPrincipal != Membership.
 * Allow candidate intake scopes (quote.submit / bill.candidate / documents.upload)
 * but reject anything that implies mutating canonical financial truth.
 */
export function assertVendorScopesAreReadOnly(scopes: readonly string[]): void {
  for (const scope of scopes) {
    if (FORBIDDEN_VENDOR_SCOPE_PATTERNS.some((pattern) => pattern.test(scope))) {
      throw new DomainRuleError(
        'Vendor portal grants cannot include financial mutation scopes',
        'errors.notAllowed',
      );
    }
    if (!isVendorPortalScope(scope)) {
      throw new DomainRuleError(
        'Vendor portal grant contains an unknown scope',
        'errors.validationFailed',
      );
    }
  }
}
