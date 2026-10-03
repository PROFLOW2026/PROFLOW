import { randomUUID } from 'node:crypto';
import { domainEvents } from '@drizzle/schema';
import { actorColumns, type Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, type DomainEventType } from './registry';

export { DOMAIN_EVENTS };
export type { DomainEventType };

/**
 * Typed domain-event outbox (frozen contract, MAIN AGENT owned).
 *
 * Application services call `emitDomainEvent(db, ...)` INSIDE the same transaction as the state
 * change. Consumers (notifications, activity feed, Command Center) read `domain_events` as
 * service role and mark `processed_at`. Facts never change after insert (DB trigger).
 *
 * Event type shape: `<domain>.<entity>.<verb>` e.g. `subcontract.claim.submitted`.
 */
export interface EmitDomainEventInput {
  readonly organizationId: string;
  readonly projectId?: string | null;
  readonly type: DomainEventType;
  readonly entityType: string;
  readonly entityId: string;
  readonly actor: Actor;
  /** Small, serialisable facts. NEVER put money for events that operational users can read. */
  readonly payload?: Record<string, unknown>;
}

export async function emitDomainEvent(db: DbExecutor, input: EmitDomainEventInput): Promise<string> {
  const actor = actorColumns(input.actor);
  // No RETURNING: external principals append events but never read them (RLS); RETURNING needs SELECT.
  const id = randomUUID();
  await db
    .insert(domainEvents)
    .values({
      id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      eventType: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorPrincipalId: actor.actorPrincipalId,
      payload: input.payload ?? {},
    });
  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test' && typeof window === 'undefined') {
    void import('@/modules/dg-events/application/kick')
      .then((mod) => mod.scheduleDgEventDrain())
      .catch(() => undefined);
  }
  return id;
}
