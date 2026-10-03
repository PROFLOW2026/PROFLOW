import { assertProjectCapability, PROJECT_CAPABILITIES, type ProjectCapability } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { resolveEntityScope, type EntityScope } from '@/shared/entity-access';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import {
  externalGrantCovers,
  requireExternalScope,
  type ExternalCapability,
  type ExternalContext,
  type ExternalGrantView,
} from '@/shared/external';

export interface ProjectEntityScope extends EntityScope {
  readonly projectId: string;
}

function projectScoped(scope: EntityScope | null, expectedProjectId?: string | null): ProjectEntityScope {
  if (!scope || !scope.projectId) throw new NotFoundError('Entity');
  if (expectedProjectId && expectedProjectId !== scope.projectId) throw new NotFoundError('Entity');
  return scope as ProjectEntityScope;
}

/** Internal: entity must be visible through the caller's RLS and the caller must hold the capability on its project. */
export async function authorizeInternalEntity(
  context: OrgContext,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly projectId?: string | null;
    readonly capability?: ProjectCapability;
  },
): Promise<ProjectEntityScope> {
  const scope = projectScoped(
    await resolveEntityScope(context.db, input.entityType, context.organizationId, input.entityId),
    input.projectId,
  );
  await assertProjectCapability(context, scope.projectId, input.capability ?? PROJECT_CAPABILITIES.PROJECT_VIEW);
  return scope;
}

export interface ExternalEntityAccess {
  readonly scope: ProjectEntityScope;
  readonly grant: ExternalGrantView;
  /** Company the contractor acts for on this entity. */
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
}

/**
 * Picks the grant that lets a contractor act on an entity:
 *  - vendor-owned entity -> the grant must cover exactly that vendor (+ agreement);
 *  - project-wide entity -> any grant of the principal covering the project (its own company).
 * Internal-only entities are invisible to contractors (NotFound, no existence oracle).
 */
export function pickExternalGrant(
  context: ExternalContext,
  scope: ProjectEntityScope,
  capability: ExternalCapability,
): ExternalEntityAccess {
  if (scope.internalOnly) throw new NotFoundError('Entity');
  if (scope.vendorId) {
    const grant = requireExternalScope(
      context,
      {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        vendorId: scope.vendorId,
        subcontractAgreementId: scope.subcontractAgreementId ?? null,
      },
      capability,
    );
    return {
      scope,
      grant,
      vendorId: scope.vendorId,
      subcontractAgreementId: scope.subcontractAgreementId ?? null,
    };
  }
  const candidates = context.grants.filter((grant) =>
    externalGrantCovers(
      grant,
      {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        vendorId: grant.vendorId,
        subcontractAgreementId: grant.subcontractAgreementId,
      },
      capability,
    ),
  );
  const grant =
    candidates.find((candidate) => candidate.projectId === scope.projectId) ?? candidates[0] ?? null;
  if (!grant) throw new AuthorizationError(`external:${capability}`);
  return { scope, grant, vendorId: grant.vendorId, subcontractAgreementId: grant.subcontractAgreementId };
}

export async function authorizeExternalEntity(
  context: ExternalContext,
  input: {
    readonly organizationId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly projectId?: string | null;
    readonly capability: ExternalCapability;
  },
): Promise<ExternalEntityAccess> {
  if (!context.grants.some((grant) => grant.organizationId === input.organizationId)) {
    throw new NotFoundError('Entity');
  }
  const scope = projectScoped(
    await resolveEntityScope(context.db, input.entityType, input.organizationId, input.entityId),
    input.projectId,
  );
  return pickExternalGrant(context, scope, input.capability);
}
