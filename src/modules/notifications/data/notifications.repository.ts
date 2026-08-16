import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { notifications } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  EVENT_DOMAIN,
  isNotificationEventType,
  isNotificationSeverity,
  type NotificationDomain,
  type NotificationEventType,
  type NotificationListItem,
  type NotificationRecord,
  type NotificationSeverity,
} from '../domain/types';

export const NOTIFICATION_LIST_CAP = 50;

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function mapRow(row: typeof notifications.$inferSelect): NotificationRecord {
  const type = isNotificationEventType(row.type) ? row.type : 'billing_overdue';
  const domain: NotificationDomain = EVENT_DOMAIN[type];
  const severity: NotificationSeverity = isNotificationSeverity(row.severity)
    ? row.severity
    : 'info';
  return {
    id: row.id,
    organizationId: row.organizationId,
    recipientUserId: row.recipientUserId,
    type,
    domain,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.title,
    body: row.body,
    severity,
    deepLink: row.deepLink,
    dedupeKey: row.dedupeKey,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
    resolvedAt: row.resolvedAt,
    expiresAt: row.expiresAt,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toListItem(row: NotificationRecord): NotificationListItem {
  return {
    id: row.id,
    type: row.type,
    domain: row.domain,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.title,
    body: row.body,
    severity: row.severity,
    deepLink: row.deepLink,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export async function listNotificationsForRecipient(
  db: DbExecutor,
  organizationId: string,
  recipientUserId: string,
  options: { readonly limit?: number } = {},
): Promise<NotificationListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? NOTIFICATION_LIST_CAP, 1), NOTIFICATION_LIST_CAP);
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.dismissedAt),
        isNull(notifications.resolvedAt),
        or(isNull(notifications.expiresAt), sql`${notifications.expiresAt} > now()`),
      ),
    )
    .orderBy(sql`(${notifications.readAt} is null) desc`, desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => toListItem(mapRow(row)));
}

export async function countUnreadForRecipient(
  db: DbExecutor,
  organizationId: string,
  recipientUserId: string,
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
        isNull(notifications.resolvedAt),
        or(isNull(notifications.expiresAt), sql`${notifications.expiresAt} > now()`),
      ),
    );

  return Number(row?.count ?? 0);
}

export async function markNotificationReadForRecipient(
  db: DbExecutor,
  organizationId: string,
  recipientUserId: string,
  notificationId: string,
): Promise<NotificationRecord | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, recipientUserId),
      ),
    )
    .returning();

  return row ? mapRow(row) : null;
}

export async function markAllNotificationsReadForRecipient(
  db: DbExecutor,
  organizationId: string,
  recipientUserId: string,
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
        isNull(notifications.resolvedAt),
        or(isNull(notifications.expiresAt), sql`${notifications.expiresAt} > now()`),
      ),
    )
    .returning({ id: notifications.id });

  return rows.length;
}

export async function listUnresolvedEntityIdsForRecipient(
  db: DbExecutor,
  organizationId: string,
  recipientUserId: string,
  type: NotificationEventType,
): Promise<string[]> {
  const rows = await db
    .select({ entityId: notifications.entityId })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, recipientUserId),
        eq(notifications.type, type),
        isNull(notifications.resolvedAt),
      ),
    );

  return rows
    .map((row) => row.entityId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function listUnresolvedEntityIdsForType(
  db: DbExecutor,
  organizationId: string,
  type: NotificationEventType,
): Promise<string[]> {
  const rows = await db
    .select({ entityId: notifications.entityId })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.type, type),
        isNull(notifications.resolvedAt),
      ),
    );

  return rows
    .map((row) => row.entityId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function emitNotificationRpc(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly recipientUserId: string;
    readonly type: string;
    readonly domain: string;
    readonly title: string;
    readonly body: string;
    readonly dedupeKey: string;
    readonly severity: string;
    readonly entityType: string | null;
    readonly entityId: string | null;
    readonly deepLink: string | null;
    readonly metadata: Record<string, unknown> | null;
    readonly expiresAt: Date | null;
  },
): Promise<string> {
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  const expiresAtIso = input.expiresAt ? input.expiresAt.toISOString() : null;
  const result = await db.execute(sql`
    SELECT app.emit_notification(
      ${input.organizationId}::uuid,
      ${input.recipientUserId}::uuid,
      ${input.type},
      ${input.domain},
      ${input.title},
      ${input.body},
      ${input.dedupeKey},
      ${input.severity},
      ${input.entityType},
      ${input.entityId}::uuid,
      ${input.deepLink},
      ${metadataJson}::jsonb,
      ${expiresAtIso}::timestamptz
    ) AS id
  `);

  const row = sqlResultRows<{ id?: unknown; emit_notification?: unknown }>(result)[0];
  const id = row?.id ?? row?.emit_notification;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('emit_notification did not return an id');
  }
  return id;
}

export async function resolveNotificationsRpc(
  db: DbExecutor,
  organizationId: string,
  type: string,
  entityId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT app.resolve_notifications(
      ${organizationId}::uuid,
      ${type},
      ${entityId}::uuid
    ) AS count
  `);
  const row = sqlResultRows<{ count?: unknown; resolve_notifications?: unknown }>(result)[0];
  const count = row?.count ?? row?.resolve_notifications;
  return Number(count ?? 0);
}

/**
 * Trusted system scanner path. Bypasses RLS via the admin connection and
 * resolves every recipient for the org+type+entity. Never exposed as a client
 * RPC or authenticated GRANT - scanners call this from server code only.
 * Do not add current_user = 'service_role' to app.resolve_notifications.
 */
export async function resolveNotificationsAsSystem(
  organizationId: string,
  type: string,
  entityId: string,
): Promise<number> {
  const { getAdminDb } = await import('@/shared/db/client');
  const db = getAdminDb();
  const rows = await db
    .update(notifications)
    .set({ resolvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.type, type),
        eq(notifications.entityId, entityId),
        isNull(notifications.resolvedAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}
