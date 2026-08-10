/**
 * Public external portal login policy (overnight V1).
 *
 * External auth is intentionally DISABLED until a safe ExternalPrincipal
 * session path exists (separate from OrganizationMembership, rate-limited,
 * grant-scoped). Admin Settings → Portal previews remain available via
 * PORTAL_MANAGE; they never open the public internet surface.
 */

export const EXTERNAL_PUBLIC_ACCESS_STATUS = 'disabled' as const;

export type ExternalPublicAccessStatus = typeof EXTERNAL_PUBLIC_ACCESS_STATUS;

export const EXTERNAL_PUBLIC_ACCESS_LIMITATION =
  'Public customer/vendor portal login is disabled. Grants, safe projections, and candidate intake are foundation-only (admin-mediated). ExternalPrincipal ≠ OrganizationMembership.';

export function getExternalPublicAccessStatus(): {
  readonly status: ExternalPublicAccessStatus;
  readonly enabled: false;
  readonly limitation: typeof EXTERNAL_PUBLIC_ACCESS_LIMITATION;
} {
  return {
    status: EXTERNAL_PUBLIC_ACCESS_STATUS,
    enabled: false,
    limitation: EXTERNAL_PUBLIC_ACCESS_LIMITATION,
  };
}

export function isExternalPublicAccessEnabled(): false {
  return false;
}

/**
 * Hard stop for any public portal route / session resolver.
 * Admin preview paths must not call this.
 */
export function assertExternalPublicAccessEnabled(): never {
  throw new Error(EXTERNAL_PUBLIC_ACCESS_LIMITATION);
}
