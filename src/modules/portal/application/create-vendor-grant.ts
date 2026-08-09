import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { normalizeVendorScopes } from '../domain/vendor-scopes';
import {
  assertVendorInOrganization,
  findOrCreateExternalPrincipal,
  insertAccessGrant,
} from '../data/portal.repository';
import {
  createVendorGrantSchema,
  type CreateVendorGrantInput,
} from '../validation/schemas';
import type { ExternalAccessGrantRecord } from '../domain/types';

/**
 * Admin-managed vendor portal grant.
 * ExternalPrincipal != Membership; grants never let vendors mutate financial truth.
 */
export async function createVendorGrant(
  context: OrgContext,
  rawInput: CreateVendorGrantInput,
): Promise<ExternalAccessGrantRecord> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = createVendorGrantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const scopes = normalizeVendorScopes(input.scopes ?? ['vendor.summary']);
  if (scopes.length === 0) {
    throw new DomainRuleError('At least one valid vendor scope is required', 'errors.validationFailed');
  }

  const ok = await assertVendorInOrganization(context.db, context.organizationId, input.vendorId);
  if (!ok) throw new NotFoundError('Vendor');

  const principal = await findOrCreateExternalPrincipal({
    email: input.email,
    displayName: input.displayName ?? null,
  });

  const grant = await insertAccessGrant(context.db, {
    organizationId: context.organizationId,
    principalId: principal.id,
    portalKind: 'vendor',
    vendorId: input.vendorId,
    scopes,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'portal');
  await noteModuleUsage(context.db, context.organizationId, 'vendors');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_GRANT_CREATED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    after: {
      portalKind: grant.portalKind,
      principalId: grant.principalId,
      vendorId: grant.vendorId,
      scopes: grant.scopes,
    },
  });

  return grant;
}
