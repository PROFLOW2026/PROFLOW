import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { normalizeCustomerScopes } from '../domain/safe-project-summary';
import {
  assertClientInOrganization,
  findOrCreateExternalPrincipal,
  findProjectForPortal,
  insertAccessGrant,
} from '../data/portal.repository';
import {
  createCustomerGrantSchema,
  type CreateCustomerGrantInput,
} from '../validation/schemas';
import type { ExternalAccessGrantRecord } from '../domain/types';

export async function createCustomerGrant(
  context: OrgContext,
  rawInput: CreateCustomerGrantInput,
): Promise<ExternalAccessGrantRecord> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = createCustomerGrantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const scopes = normalizeCustomerScopes(input.scopes ?? ['project.summary']);
  if (scopes.length === 0) {
    throw new DomainRuleError('At least one valid customer scope is required', 'errors.validationFailed');
  }

  if (input.clientId) {
    const ok = await assertClientInOrganization(context.db, context.organizationId, input.clientId);
    if (!ok) throw new NotFoundError('Client');
  }

  if (input.projectId) {
    const project = await findProjectForPortal(context.db, context.organizationId, input.projectId);
    if (!project) throw new NotFoundError('Project');
    if (input.clientId && project.clientId && project.clientId !== input.clientId) {
      throw new DomainRuleError(
        'Project does not belong to the selected client',
        'errors.validationFailed',
      );
    }
  }

  const principal = await findOrCreateExternalPrincipal({
    email: input.email,
    displayName: input.displayName ?? null,
  });

  const grant = await insertAccessGrant(context.db, {
    organizationId: context.organizationId,
    principalId: principal.id,
    portalKind: 'customer',
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    scopes,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'portal');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_GRANT_CREATED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    after: {
      portalKind: grant.portalKind,
      principalId: grant.principalId,
      clientId: grant.clientId,
      projectId: grant.projectId,
      scopes: grant.scopes,
    },
  });

  return grant;
}
