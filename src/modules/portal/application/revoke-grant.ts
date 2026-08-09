import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { findGrantById, revokeAccessGrant } from '../data/portal.repository';
import { revokeGrantSchema, type RevokeGrantInput } from '../validation/schemas';
import type { ExternalAccessGrantRecord, PortalKind } from '../domain/types';

async function revokeGrantOfKind(
  context: OrgContext,
  rawInput: RevokeGrantInput,
  portalKind: PortalKind,
): Promise<ExternalAccessGrantRecord> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = revokeGrantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findGrantById(context.organizationId, parsed.data.grantId);
  if (!existing || existing.portalKind !== portalKind) throw new NotFoundError('Portal grant');

  const revoked = await revokeAccessGrant(context.organizationId, parsed.data.grantId);
  if (!revoked) throw new NotFoundError('Portal grant');

  await noteModuleUsage(context.db, context.organizationId, 'portal');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_GRANT_REVOKED,
    entityType: 'external_access_grant',
    entityId: revoked.id,
    before: { status: existing.status, revokedAt: existing.revokedAt, portalKind },
    after: { status: revoked.status, revokedAt: revoked.revokedAt, portalKind },
  });

  return revoked;
}

export async function revokeCustomerGrant(
  context: OrgContext,
  rawInput: RevokeGrantInput,
): Promise<ExternalAccessGrantRecord> {
  return revokeGrantOfKind(context, rawInput, 'customer');
}

export async function revokeVendorGrant(
  context: OrgContext,
  rawInput: RevokeGrantInput,
): Promise<ExternalAccessGrantRecord> {
  return revokeGrantOfKind(context, rawInput, 'vendor');
}
