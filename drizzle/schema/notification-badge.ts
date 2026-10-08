import { check, index, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * Last merged bell count (persisted unread + Command Center attention items).
 * Updated only when a full merge was already computed — never by shell render alone.
 */
export const notificationAttentionBadgeSnapshots = pgTable(
  'notification_attention_badge_snapshots',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activeAttentionCount: integer('active_attention_count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index('notification_attention_badge_snapshots_user_idx').on(table.userId),
    check(
      'notification_attention_badge_snapshots_count_nonneg',
      sql`${table.activeAttentionCount} >= 0`,
    ),
  ],
);
