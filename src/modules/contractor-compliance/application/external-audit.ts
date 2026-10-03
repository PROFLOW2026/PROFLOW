import { writeAuditEvent, type AuditAction } from '@/shared/audit';
import type { DbExecutor } from '@/shared/db/types';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';

/**
 * Audit row for an EXTERNAL (contractor) action. External principals have no org membership, so the
 * row is written with service-role elevation after the use-case authorized the action, and carries
 * `metadata.actor = { type: 'external', principalId }` (shared contracts §8).
 */
export async function recordExternalAudit(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly principalId: string;
    readonly action: AuditAction;
    readonly entityType: string;
    readonly entityId: string;
    readonly after?: unknown;
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
      metadata: { actor: { type: 'external', principalId: input.principalId } },
    }),
  );
}
