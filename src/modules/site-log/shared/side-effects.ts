import { writeAuditEvent, type AuditAction } from '@/shared/audit';
import { externalActor } from '@/shared/actor';
import { asServiceRoleWrite } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { emitDomainEvent, type DomainEventType } from '@/shared/domain-events';

/**
 * Audit + domain event for an EXTERNAL write, after the use-case has authorized it with
 * `requireExternalScope`. External principals have no audit_events access, so both rows are written
 * as service role inside the caller's transaction (shared contract section 8: metadata.actor).
 */
export async function recordExternalFieldWrite(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly principalId: string;
    readonly audit: { readonly action: AuditAction; readonly entityType: string; readonly entityId: string; readonly after?: unknown };
    readonly event?: {
      readonly type: DomainEventType;
      readonly entityType: string;
      readonly entityId: string;
      readonly payload?: Record<string, unknown>;
    };
  },
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await writeAuditEvent(db, {
      organizationId: input.organizationId,
      actorUserId: null,
      action: input.audit.action,
      entityType: input.audit.entityType,
      entityId: input.audit.entityId,
      after: input.audit.after,
      metadata: { actor: { type: 'external', principalId: input.principalId }, projectId: input.projectId },
    });
    if (input.event) {
      await emitDomainEvent(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        type: input.event.type,
        entityType: input.event.entityType,
        entityId: input.event.entityId,
        actor: externalActor(input.principalId),
        payload: input.event.payload,
      });
    }
  });
}
