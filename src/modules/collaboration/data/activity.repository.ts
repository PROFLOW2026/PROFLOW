import { and, desc, eq, gte, inArray, like, lt, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { collabComments, domainEvents, taskExternalEvents, tasks } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ActivityCursor, ActivityEventRecord } from '../domain/activity';

export interface ActivityQueryFilters {
  readonly vendorId?: string | null;
  /** First event-type segment, e.g. 'task', 'subcontract', 'coordination'. */
  readonly domain?: string | null;
  /** internal profiles.id or external_principals.id. */
  readonly actorId?: string | null;
  readonly locationId?: string | null;
  readonly workPackageId?: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly from?: Date | null;
  /** Exclusive upper bound. */
  readonly to?: Date | null;
}

function keyset(occurredAt: AnyColumn, id: AnyColumn, cursor: ActivityCursor): SQL {
  return sql`(${occurredAt}, ${id}) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`;
}

/** Project timeline from domain_events (internal; RLS: org member + project access). */
export async function listProjectDomainEvents(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly filters: ActivityQueryFilters;
    readonly cursor: ActivityCursor | null;
    readonly limit: number;
  },
): Promise<ActivityEventRecord[]> {
  const f = input.filters;
  const conditions: SQL[] = [
    eq(domainEvents.organizationId, input.organizationId),
    eq(domainEvents.projectId, input.projectId),
  ];
  if (f.domain && /^[a-z][a-z0-9_]*$/.test(f.domain)) conditions.push(like(domainEvents.eventType, `${f.domain}.%`));
  if (f.actorId) {
    conditions.push(or(eq(domainEvents.actorUserId, f.actorId), eq(domainEvents.actorPrincipalId, f.actorId))!);
  }
  if (f.vendorId) {
    conditions.push(
      or(
        sql`${domainEvents.payload} ->> 'vendorId' = ${f.vendorId}`,
        and(eq(domainEvents.entityType, 'vendor'), eq(domainEvents.entityId, f.vendorId)),
      )!,
    );
  }
  if (f.locationId) conditions.push(sql`${domainEvents.payload} ->> 'locationId' = ${f.locationId}`);
  if (f.workPackageId) conditions.push(sql`${domainEvents.payload} ->> 'workPackageId' = ${f.workPackageId}`);
  if (f.entityType) conditions.push(eq(domainEvents.entityType, f.entityType));
  if (f.entityId) conditions.push(eq(domainEvents.entityId, f.entityId));
  if (f.from) conditions.push(gte(domainEvents.occurredAt, f.from));
  if (f.to) conditions.push(lt(domainEvents.occurredAt, f.to));
  if (input.cursor) conditions.push(keyset(domainEvents.occurredAt, domainEvents.id, input.cursor));

  const rows = await db
    .select({
      id: domainEvents.id,
      eventType: domainEvents.eventType,
      entityType: domainEvents.entityType,
      entityId: domainEvents.entityId,
      projectId: domainEvents.projectId,
      actorType: domainEvents.actorType,
      actorUserId: domainEvents.actorUserId,
      actorPrincipalId: domainEvents.actorPrincipalId,
      payload: domainEvents.payload,
      occurredAt: domainEvents.occurredAt,
    })
    .from(domainEvents)
    .where(and(...conditions))
    .orderBy(desc(domainEvents.occurredAt), desc(domainEvents.id))
    .limit(input.limit);
  return rows.map((row) => ({ ...row, payload: row.payload ?? {} }));
}

const ACTION_EVENT_TYPE: Record<string, string> = {
  assigned: 'task.external.assigned',
  reassigned: 'task.external.assigned',
  acknowledged: 'task.external.acknowledged',
  started: 'task.external.started',
  completion_submitted: 'task.external.completion_submitted',
  verified: 'task.external.verified',
  reopened: 'task.external.reopened',
  closed: 'task.external.closed',
  cancelled: 'task.external.cancelled',
};

/**
 * Contractor timeline (external viewers never read domain_events): own-vendor task history and
 * contractor-audience posts, both filtered by RLS on the external principal's executor.
 */
export async function listContractorActivity(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly vendorIds: readonly string[];
    readonly cursor: ActivityCursor | null;
    readonly limit: number;
  },
): Promise<ActivityEventRecord[]> {
  if (input.vendorIds.length === 0) return [];
  const taskConditions: SQL[] = [
    eq(taskExternalEvents.organizationId, input.organizationId),
    eq(taskExternalEvents.projectId, input.projectId),
  ];
  if (input.cursor) taskConditions.push(keyset(taskExternalEvents.createdAt, taskExternalEvents.id, input.cursor));
  const taskRows = await db
    .select({
      id: taskExternalEvents.id,
      action: taskExternalEvents.action,
      taskId: taskExternalEvents.taskId,
      fromStatus: taskExternalEvents.fromStatus,
      toStatus: taskExternalEvents.toStatus,
      outcome: taskExternalEvents.outcome,
      actorType: taskExternalEvents.actorType,
      actorUserId: taskExternalEvents.actorUserId,
      actorPrincipalId: taskExternalEvents.actorPrincipalId,
      createdAt: taskExternalEvents.createdAt,
      title: tasks.title,
    })
    .from(taskExternalEvents)
    .innerJoin(
      tasks,
      and(eq(tasks.id, taskExternalEvents.taskId), eq(tasks.organizationId, taskExternalEvents.organizationId)),
    )
    .where(and(...taskConditions))
    .orderBy(desc(taskExternalEvents.createdAt), desc(taskExternalEvents.id))
    .limit(input.limit);

  const commentConditions: SQL[] = [
    eq(collabComments.organizationId, input.organizationId),
    eq(collabComments.projectId, input.projectId),
    eq(collabComments.audience, 'contractor'),
    or(sql`${collabComments.vendorId} IS NULL`, inArray(collabComments.vendorId, [...input.vendorIds]))!,
  ];
  if (input.cursor) commentConditions.push(keyset(collabComments.createdAt, collabComments.id, input.cursor));
  const commentRows = await db
    .select({
      id: collabComments.id,
      entityType: collabComments.entityType,
      entityId: collabComments.entityId,
      kind: collabComments.kind,
      actorType: collabComments.actorType,
      actorUserId: collabComments.actorUserId,
      actorPrincipalId: collabComments.actorPrincipalId,
      createdAt: collabComments.createdAt,
    })
    .from(collabComments)
    .where(and(...commentConditions))
    .orderBy(desc(collabComments.createdAt), desc(collabComments.id))
    .limit(input.limit);

  const merged: ActivityEventRecord[] = [
    ...taskRows.map((row) => ({
      id: row.id,
      eventType: ACTION_EVENT_TYPE[row.action] ?? 'task.external.assigned',
      entityType: 'task',
      entityId: row.taskId,
      projectId: input.projectId,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      actorPrincipalId: row.actorPrincipalId,
      payload: {
        title: row.title,
        fromStatus: row.fromStatus ?? undefined,
        toStatus: row.toStatus,
        outcome: row.outcome ?? undefined,
      },
      occurredAt: row.createdAt,
    })),
    ...commentRows.map((row) => ({
      id: row.id,
      eventType: 'collab.comment.posted',
      entityType: row.entityType,
      entityId: row.entityId,
      projectId: input.projectId,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      actorPrincipalId: row.actorPrincipalId,
      payload: { audience: 'contractor' },
      occurredAt: row.createdAt,
    })),
  ];
  merged.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || (a.id < b.id ? 1 : -1));
  return merged.slice(0, input.limit);
}
