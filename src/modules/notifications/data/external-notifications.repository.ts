import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { externalNotifications } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export const EXTERNAL_NOTIFICATION_LIST_CAP = 50;

export type ExternalNotificationRow = typeof externalNotifications.$inferSelect;

/**
 * Reads run on the principal's RLS-bound executor (`ExternalContext.db`); the explicit
 * `principal_id` filter mirrors the RLS policy so the query stays index-driven.
 */
export async function listExternalNotificationRows(
  db: DbExecutor,
  principalId: string,
  organizationIds: readonly string[],
  limit: number,
): Promise<ExternalNotificationRow[]> {
  if (organizationIds.length === 0) return [];
  return db
    .select()
    .from(externalNotifications)
    .where(
      and(
        eq(externalNotifications.principalId, principalId),
        inArray(externalNotifications.organizationId, [...organizationIds]),
        isNull(externalNotifications.dismissedAt),
      ),
    )
    .orderBy(sql`(${externalNotifications.readAt} is null) desc`, desc(externalNotifications.lastOccurredAt))
    .limit(Math.min(Math.max(limit, 1), EXTERNAL_NOTIFICATION_LIST_CAP));
}

export const EXTERNAL_UNREAD_SCAN_CAP = 500;

export type ExternalNotificationScopeRow = Pick<
  ExternalNotificationRow,
  'id' | 'organizationId' | 'vendorId' | 'projectId' | 'subcontractAgreementId' | 'requiredCapabilities'
>;

/** Unread rows with only the scope columns (the caller re-checks them against current grants). */
export async function listUnreadExternalNotificationScopeRows(
  db: DbExecutor,
  principalId: string,
  organizationIds: readonly string[],
): Promise<ExternalNotificationScopeRow[]> {
  if (organizationIds.length === 0) return [];
  return db
    .select({
      id: externalNotifications.id,
      organizationId: externalNotifications.organizationId,
      vendorId: externalNotifications.vendorId,
      projectId: externalNotifications.projectId,
      subcontractAgreementId: externalNotifications.subcontractAgreementId,
      requiredCapabilities: externalNotifications.requiredCapabilities,
    })
    .from(externalNotifications)
    .where(
      and(
        eq(externalNotifications.principalId, principalId),
        inArray(externalNotifications.organizationId, [...organizationIds]),
        isNull(externalNotifications.readAt),
        isNull(externalNotifications.dismissedAt),
      ),
    )
    .limit(EXTERNAL_UNREAD_SCAN_CAP);
}

export async function findExternalNotificationRow(
  db: DbExecutor,
  principalId: string,
  notificationId: string,
): Promise<ExternalNotificationRow | null> {
  const [row] = await db
    .select()
    .from(externalNotifications)
    .where(and(eq(externalNotifications.id, notificationId), eq(externalNotifications.principalId, principalId)))
    .limit(1);
  return row ?? null;
}

export async function markExternalNotificationRowRead(
  db: DbExecutor,
  principalId: string,
  notificationId: string,
): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .update(externalNotifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(externalNotifications.id, notificationId),
        eq(externalNotifications.principalId, principalId),
        isNull(externalNotifications.readAt),
      ),
    )
    .returning({ id: externalNotifications.id });
  return rows.length > 0;
}

export async function markExternalNotificationRowsRead(
  db: DbExecutor,
  principalId: string,
  notificationIds: readonly string[],
): Promise<number> {
  if (notificationIds.length === 0) return 0;
  const now = new Date();
  const rows = await db
    .update(externalNotifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(externalNotifications.principalId, principalId),
        inArray(externalNotifications.id, [...notificationIds]),
        isNull(externalNotifications.readAt),
      ),
    )
    .returning({ id: externalNotifications.id });
  return rows.length;
}
