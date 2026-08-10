import { DomainRuleError } from '@/shared/errors';
import type { ExternalAccessGrantRecord } from './types';

/**
 * Tenant isolation helpers for portal grants.
 * Every grant lookup must already filter by organizationId at the repository;
 * these asserts defend application paths against cross-tenant IDOR.
 */

export function assertGrantBelongsToOrganization(
  grant: Pick<ExternalAccessGrantRecord, 'organizationId'>,
  organizationId: string,
): void {
  if (grant.organizationId !== organizationId) {
    throw new DomainRuleError(
      'Portal grant does not belong to this organization',
      'portal.errors.crossTenant',
    );
  }
}

export function assertSameOrganization(
  leftOrganizationId: string,
  rightOrganizationId: string,
  message = 'Cross-tenant portal access denied',
): void {
  if (leftOrganizationId !== rightOrganizationId) {
    throw new DomainRuleError(message, 'portal.errors.crossTenant');
  }
}

/** True when grant org matches the requested org (strict equality). */
export function grantMatchesOrganization(
  grant: Pick<ExternalAccessGrantRecord, 'organizationId'>,
  organizationId: string,
): boolean {
  return grant.organizationId === organizationId;
}
