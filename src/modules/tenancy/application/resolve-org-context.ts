import { AuthorizationError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { loadEffectivePermissions } from '@/modules/rbac';
import { findActiveMembership, findOrganizationById } from '../data/organizations.repository';

/**
 * Turns "this user claims to be working in this organization" into a verified
 * `OrgContext` (doc 73 §4).
 *
 * Membership is re-checked on every request. A cookie, a form field or a URL
 * segment is only ever a *hint* about which organization the user means; it is
 * never evidence that they belong to it.
 */
export async function resolveOrgContext(
  db: DbExecutor,
  input: { userId: string; organizationId: string; locale: string },
): Promise<OrgContext> {
  const membership = await findActiveMembership(db, input.organizationId, input.userId);
  if (!membership) {
    // Same error whether the organization is missing or simply not theirs.
    throw new AuthorizationError();
  }

  const organization = await findOrganizationById(db, input.organizationId);
  if (!organization) throw new NotFoundError('Organization');

  const { permissions, roleKeys } = await loadEffectivePermissions(
    db,
    input.organizationId,
    input.userId,
  );

  return {
    userId: input.userId,
    organizationId: organization.id,
    membershipId: membership.id,
    organization,
    permissions,
    roleKeys,
    db,
    locale: input.locale,
  };
}
