import type { OrgContext } from '@/shared/auth/context';
import { writeAuditEvent, type AuditAction } from '@/shared/audit';
import { asServiceRoleWrite } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { AuthorizationError, ValidationError } from '@/shared/errors';
import {
  externalGrantCovers,
  type ExternalCapability,
  type ExternalContext,
  type ExternalGrantView,
} from '@/shared/external';
import { listProjectTeam } from '@/modules/project-team';
import { findProjectAgreement } from '../data/project-options.repository';

export function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export function fieldError(path: string, messageKey: string, message: string): ValidationError {
  return new ValidationError([{ path, messageKey, message }]);
}

/** Agreement on this project -> its vendor. Unknown / other-project agreements are a field error. */
export async function resolveAgreementVendor(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  agreementId: string | null | undefined,
): Promise<{ vendorId: string | null; agreementId: string | null }> {
  if (!agreementId) return { vendorId: null, agreementId: null };
  const agreement = await findProjectAgreement(db, organizationId, projectId, agreementId);
  if (!agreement) {
    throw fieldError('subcontractAgreementId', 'rfi.errors.agreementNotOnProject', 'Agreement not on project');
  }
  return { vendorId: agreement.vendorId, agreementId: agreement.id };
}

/** Assignees / reviewers are the caller or an active member of the project team. */
export async function assertProjectAssignee(
  context: OrgContext,
  projectId: string,
  userId: string | null | undefined,
  path: string,
): Promise<void> {
  if (!userId || userId === context.userId) return;
  const team = await listProjectTeam(context, projectId);
  if (!team.some((member) => member.userId === userId && member.status === 'active')) {
    throw fieldError(path, 'rfi.errors.assigneeNotOnTeam', 'Assignee is not on the project team');
  }
}

export interface AssigneeOption {
  readonly userId: string;
  readonly name: string;
}

export async function listAssigneeOptions(context: OrgContext, projectId: string): Promise<AssigneeOption[]> {
  const team = await listProjectTeam(context, projectId);
  const options = new Map<string, string>();
  for (const member of team) {
    if (member.status === 'active') options.set(member.userId, member.displayName ?? member.email);
  }
  return [...options].map(([userId, name]) => ({ userId, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Grants of the principal that cover (org, project) for a capability, optionally for one vendor.
 * Agreement-narrowed grants carry their agreement into the target.
 */
export function coveringGrants(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  capability: ExternalCapability,
  vendorId?: string | null,
): ExternalGrantView[] {
  return context.grants
    .filter((grant) => !vendorId || grant.vendorId === vendorId)
    .filter((grant) =>
      externalGrantCovers(
        grant,
        {
          organizationId,
          projectId,
          vendorId: grant.vendorId,
          subcontractAgreementId: grant.subcontractAgreementId,
        },
        capability,
      ),
    )
    .sort((a, b) => a.grantId.localeCompare(b.grantId));
}

/** Vendor ids the principal may act for on a project (empty -> caller has no access). */
export function scopedVendorIds(
  context: ExternalContext,
  organizationId: string,
  projectId: string | null,
  capability: ExternalCapability,
): string[] {
  return [
    ...new Set(
      context.grants
        .filter((grant) => grant.organizationId === organizationId)
        .filter(
          (grant) =>
            projectId === null
              ? grant.capabilities.has(capability) && (!grant.expiresAt || grant.expiresAt.getTime() > Date.now())
              : externalGrantCovers(
                  grant,
                  {
                    organizationId,
                    projectId,
                    vendorId: grant.vendorId,
                    subcontractAgreementId: grant.subcontractAgreementId,
                  },
                  capability,
                ),
        )
        .map((grant) => grant.vendorId),
    ),
  ];
}

/** Vendors covered by any one of the capabilities (read does not imply raise). */
export function scopedVendorIdsAny(
  context: ExternalContext,
  organizationId: string,
  projectId: string | null,
  capabilities: readonly ExternalCapability[],
): string[] {
  return [...new Set(capabilities.flatMap((capability) => scopedVendorIds(context, organizationId, projectId, capability)))];
}

export function requireScopedVendors(
  context: ExternalContext,
  organizationId: string,
  projectId: string | null,
  capability: ExternalCapability,
): string[] {
  const vendorIds = scopedVendorIds(context, organizationId, projectId, capability);
  if (vendorIds.length === 0) throw new AuthorizationError(`external:${capability}`);
  return vendorIds;
}

/**
 * Audit row for an external action. External principals cannot insert into `audit_events` (org members
 * only), so the already-authorized use-case writes it as service role inside the same transaction.
 * `metadata.actor` carries the external identity (contract section 8).
 */
export async function recordExternalAuditEvent(
  db: DbExecutor,
  context: ExternalContext,
  input: {
    organizationId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await asServiceRoleWrite(db, () =>
    writeAuditEvent(db, {
      organizationId: input.organizationId,
      actorUserId: null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      after: input.after,
      metadata: { ...(input.metadata ?? {}), actor: { type: 'external', principalId: context.principalId } },
    }),
  );
}