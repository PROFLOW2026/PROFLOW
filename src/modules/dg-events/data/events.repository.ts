import { and, asc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { domainEventRetries, domainEvents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { DG_MAX_ATTEMPTS } from '../domain/backoff';
import type { DomainEventRecord } from '../domain/types';

function normalizePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

/**
 * Locks the next due batch (`FOR UPDATE SKIP LOCKED`) so concurrent workers never process the
 * same event. Must run inside a transaction; locks are held until that transaction ends.
 */
export async function claimDueDomainEvents(
  tx: DbExecutor,
  input: { readonly limit: number; readonly now: Date },
): Promise<DomainEventRecord[]> {
  const rows = await tx
    .select({
      id: domainEvents.id,
      organizationId: domainEvents.organizationId,
      projectId: domainEvents.projectId,
      eventType: domainEvents.eventType,
      entityType: domainEvents.entityType,
      entityId: domainEvents.entityId,
      actorType: domainEvents.actorType,
      actorUserId: domainEvents.actorUserId,
      actorPrincipalId: domainEvents.actorPrincipalId,
      payload: domainEvents.payload,
      occurredAt: domainEvents.occurredAt,
      attempts: domainEvents.attempts,
    })
    .from(domainEvents)
    .leftJoin(domainEventRetries, eq(domainEventRetries.eventId, domainEvents.id))
    .where(
      and(
        isNull(domainEvents.processedAt),
        lt(domainEvents.attempts, DG_MAX_ATTEMPTS),
        or(isNull(domainEventRetries.nextAttemptAt), lte(domainEventRetries.nextAttemptAt, input.now)),
      ),
    )
    .orderBy(asc(domainEvents.occurredAt), asc(domainEvents.id))
    .limit(input.limit)
    .for('update', { of: domainEvents, skipLocked: true });

  return rows.map((row) => ({
    ...row,
    actorType: row.actorType,
    payload: normalizePayload(row.payload),
  }));
}

export async function markDomainEventProcessed(tx: DbExecutor, eventId: string, now: Date): Promise<void> {
  await tx
    .update(domainEvents)
    .set({ processedAt: now, attempts: sql`${domainEvents.attempts} + 1`, lastError: null })
    .where(and(eq(domainEvents.id, eventId), isNull(domainEvents.processedAt)));
  await tx.delete(domainEventRetries).where(eq(domainEventRetries.eventId, eventId));
}

export async function markDomainEventFailed(
  tx: DbExecutor,
  input: {
    readonly event: Pick<DomainEventRecord, 'id' | 'organizationId'>;
    readonly attempts: number;
    readonly error: string;
    readonly now: Date;
    readonly nextAttemptAt: Date;
  },
): Promise<void> {
  await tx
    .update(domainEvents)
    .set({ attempts: input.attempts, lastError: input.error })
    .where(and(eq(domainEvents.id, input.event.id), isNull(domainEvents.processedAt)));
  await tx
    .insert(domainEventRetries)
    .values({
      eventId: input.event.id,
      organizationId: input.event.organizationId,
      nextAttemptAt: input.nextAttemptAt,
      lastAttemptAt: input.now,
    })
    .onConflictDoUpdate({
      target: domainEventRetries.eventId,
      set: { nextAttemptAt: input.nextAttemptAt, lastAttemptAt: input.now, updatedAt: input.now },
    });
}

export async function countDeadLetteredDomainEvents(db: DbExecutor): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(domainEvents)
    .where(and(isNull(domainEvents.processedAt), sql`${domainEvents.attempts} >= ${DG_MAX_ATTEMPTS}`));
  return Number(row?.count ?? 0);
}
