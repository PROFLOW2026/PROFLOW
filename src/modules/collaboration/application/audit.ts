import { recordAuditEvent, writeAuditEvent, type AuditAction } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db';
import type { ExternalContext } from '@/shared/external';

export interface CollabAuditInput {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export function auditInternal(context: OrgContext, input: CollabAuditInput): Promise<void> {
  return recordAuditEvent(context, input);
}

/**
 * External principals cannot write audit_events under RLS; the trail row is written as service
 * role inside the caller's transaction, with the external actor in metadata (shared contracts §8).
 */
export function auditExternal(
  context: ExternalContext,
  organizationId: string,
  input: CollabAuditInput,
): Promise<void> {
  return asServiceRoleWrite(context.db, () =>
    writeAuditEvent(context.db, {
      organizationId,
      actorUserId: null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      after: input.after,
      metadata: { ...input.metadata, actor: { type: 'external', principalId: context.principalId } },
    }),
  );
}
