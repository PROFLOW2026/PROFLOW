import type { OrgContext } from '@/shared/auth/context';
import { writeAuditEvent, type AuditAction } from '@/shared/audit';
import { asServiceRoleWrite } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { ValidationError } from '@/shared/errors';
import {
  externalGrantCovers,
  type ExternalCapability,
  type ExternalContext,
  type ExternalGrantView,
} from '@/shared/external';

export function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        messageKey: issue.message.startsWith('subcontractClaims.') ? issue.message : undefined,
      })),
    );
  }
  return result.data;
}

export async function recordInternalAudit(
  db: DbExecutor,
  context: OrgContext,
  input: { action: AuditAction; entityType: string; entityId: string; after?: unknown; metadata?: Record<string, unknown> },
): Promise<void> {
  await writeAuditEvent(db, {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    after: input.after,
    metadata: input.metadata,
  });
}

/**
 * External principals cannot insert into `audit_events`; the already-authorized use-case writes the row as
 * service role inside the same transaction with `metadata.actor` (contract section 8).
 */
export async function recordExternalAudit(
  db: DbExecutor,
  context: ExternalContext,
  input: { organizationId: string; action: AuditAction; entityType: string; entityId: string; after?: unknown },
): Promise<void> {
  await asServiceRoleWrite(db, () =>
    writeAuditEvent(db, {
      organizationId: input.organizationId,
      actorUserId: null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      after: input.after,
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    }),
  );
}

/** Grants of the principal covering (org, project) for a capability, optionally narrowed to a vendor/agreement. */
export function coveringGrants(
  context: ExternalContext,
  target: { organizationId: string; projectId: string; vendorId?: string | null; agreementId?: string | null },
  capability: ExternalCapability,
): ExternalGrantView[] {
  return context.grants
    .filter((grant) => !target.vendorId || grant.vendorId === target.vendorId)
    .filter((grant) =>
      externalGrantCovers(
        grant,
        {
          organizationId: target.organizationId,
          projectId: target.projectId,
          vendorId: grant.vendorId,
          subcontractAgreementId: target.agreementId ?? grant.subcontractAgreementId,
        },
        capability,
      ),
    );
}

/** Vendors the principal may act for on a project with any of the capabilities. */
export function scopedVendorIds(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  capabilities: readonly ExternalCapability[],
): string[] {
  const vendorIds = new Set<string>();
  for (const capability of capabilities) {
    for (const grant of coveringGrants(context, { organizationId, projectId }, capability)) {
      vendorIds.add(grant.vendorId);
    }
  }
  return [...vendorIds];
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
