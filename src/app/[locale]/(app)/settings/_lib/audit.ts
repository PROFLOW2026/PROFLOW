import { and, desc, eq, lt } from 'drizzle-orm';
import { auditEvents, profiles } from '@drizzle/schema';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';

/** Safe audit row for UI — never includes before/after payload content. */
export interface AuditEventSummary {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorEmail: string | null;
  readonly createdAt: Date;
}

export interface AuditListResult {
  readonly items: readonly AuditEventSummary[];
  readonly nextCursor: string | null;
}

const PAGE_SIZE = 25;

export async function listAuditEvents(
  context: OrgContext,
  options: { cursor?: string | null } = {},
): Promise<AuditListResult> {
  assertPermission(context, PERMISSIONS.AUDIT_READ);

  const cursorDate = options.cursor ? new Date(options.cursor) : null;

  const rows = await context.db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      actorUserId: auditEvents.actorUserId,
      actorDisplayName: profiles.displayName,
      actorEmail: profiles.email,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(profiles, eq(profiles.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.organizationId, context.organizationId),
        cursorDate ? lt(auditEvents.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId,
    actorDisplayName: row.actorDisplayName,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt,
  }));

  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1]!.createdAt.toISOString() : null;

  return { items, nextCursor };
}
