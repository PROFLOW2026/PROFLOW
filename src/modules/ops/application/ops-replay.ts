import 'server-only';

import { inArray } from 'drizzle-orm';
import { crossOrgSyncOutbox, domainEventRetries, domainEvents } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';

const REPLAY_LIMIT = 50;

export type OpsReplayKind = 'dg_event' | 'outbox';

export async function replayOpsQueueItems(
  context: OrgContext,
  input: { readonly kind: OpsReplayKind; readonly ids: readonly string[] },
): Promise<{ readonly replayed: number }> {
  if (input.ids.length === 0 || input.ids.length > REPLAY_LIMIT) {
    throw new Error('invalid_replay_ids');
  }

  const db = getAdminDb();
  const now = new Date();
  let replayed = 0;

  if (input.kind === 'dg_event') {
    await db
      .update(domainEvents)
      .set({ attempts: 0, lastError: null, processedAt: null })
      .where(inArray(domainEvents.id, [...input.ids]));
    await db.delete(domainEventRetries).where(inArray(domainEventRetries.eventId, [...input.ids]));
    replayed = input.ids.length;
  } else {
    await db
      .update(crossOrgSyncOutbox)
      .set({ status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null })
      .where(inArray(crossOrgSyncOutbox.id, [...input.ids]));
    replayed = input.ids.length;
  }

  for (const id of input.ids) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.OPS_REPLAY_REQUESTED,
      entityType: input.kind === 'dg_event' ? 'domain_event' : 'cross_org_sync_outbox',
      entityId: id,
      metadata: { kind: input.kind },
    });
  }

  return { replayed };
}
