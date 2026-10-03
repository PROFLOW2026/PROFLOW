import { writeAuditEvent, type AuditAction } from '@/shared/audit';
import type { DbExecutor } from '@/shared/db/types';
import type { ExternalContext } from '@/shared/external';

/**
 * Audit for actions performed BY an external principal (contract section 8): `actor_user_id` stays
 * null and `metadata.actor = { type: 'external', principalId }`. Written through the principal's
 * RLS-bound executor; policy `audit_events_external_insert` (0156) only accepts the acting principal
 * in an organization where it holds a live grant.
 */
export interface ExternalAuditInput {
  readonly organizationId: string;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export function externalAuditMetadata(principalId: string, metadata?: Record<string, unknown>): Record<string, unknown> {
  return { ...(metadata ?? {}), actor: { type: 'external', principalId } };
}

export async function recordExternalAuditEvent(context: ExternalContext, input: ExternalAuditInput): Promise<void> {
  await writeExternalAuditEvent(context.db, context.principalId, input);
}

/** Same as `recordExternalAuditEvent` for trusted pre-session flows (activation / reset) on the service connection. */
export async function writeExternalAuditEvent(
  db: DbExecutor,
  principalId: string,
  input: ExternalAuditInput,
): Promise<void> {
  await writeAuditEvent(db, {
    organizationId: input.organizationId,
    actorUserId: null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before,
    after: input.after,
    metadata: externalAuditMetadata(principalId, input.metadata),
  });
}
