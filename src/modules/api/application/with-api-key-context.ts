import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db/client';
import { NotFoundError } from '@/shared/errors';
import { findOrganizationById } from '@/modules/tenancy';
import type { AuthenticatedApiKey } from '../domain/types';
import { permissionsForApiScopes } from '../domain/scope-permissions';

/**
 * Builds an OrgContext from a validated API key.
 *
 * Justified admin DB: API keys are not session-bound; RLS has no JWT sub.
 * Tenant isolation is enforced by pinning organizationId from the key row and
 * mapping scopes onto the same PermissionKey set the UI uses.
 */
export async function withApiKeyOrgContext<T>(
  auth: AuthenticatedApiKey,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const db = getAdminDb();
  const organization = await findOrganizationById(db, auth.organizationId);
  if (!organization) {
    throw new NotFoundError('Organization');
  }

  const context: OrgContext = {
    userId: auth.keyId,
    organizationId: auth.organizationId,
    membershipId: auth.keyId,
    organization,
    permissions: permissionsForApiScopes(auth.scopes),
    roleKeys: ['api_key'],
    db,
    locale: organization.defaultLocale || 'en',
  };

  return fn(context);
}
