import { ValidationError } from '@/shared/errors';

/**
 * API tenants are always derived from the authenticated key.
 * Reject client-supplied organizationId probes instead of silently ignoring them.
 */
export function assertNoClientOrganizationOverride(searchParams: URLSearchParams): void {
  if (searchParams.has('organizationId')) {
    throw new ValidationError([
      {
        path: 'organizationId',
        message: 'organizationId must not be supplied; tenant is derived from the API key',
      },
    ]);
  }
}
