import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow, sqlRows } from '@/shared/db/sql-rows';

export type NotificationEmailLogStatus = 'sent' | 'skipped' | 'failed';

/** Returns true when a row already exists for this dedupe tuple (0200 migration). */
export async function notificationEmailLogExists(
  db: DbExecutor,
  input: {
    organizationId: string;
    dedupeKey: string;
    recipientEmail: string;
  },
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.notification_email_log
      WHERE organization_id = ${input.organizationId}::uuid
        AND dedupe_key = ${input.dedupeKey}
        AND recipient_email = ${input.recipientEmail}
    ) AS exists
  `);
  const row = sqlFirstRow<{ exists: boolean }>(result);
  return Boolean(row?.exists);
}

export async function insertNotificationEmailLog(
  db: DbExecutor,
  input: {
    organizationId: string;
    dedupeKey: string;
    recipientEmail: string;
    status: NotificationEmailLogStatus;
  },
): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO public.notification_email_log (
      organization_id,
      dedupe_key,
      recipient_email,
      status
    )
    VALUES (
      ${input.organizationId}::uuid,
      ${input.dedupeKey},
      ${input.recipientEmail},
      ${input.status}
    )
    ON CONFLICT (organization_id, dedupe_key, recipient_email) DO NOTHING
    RETURNING id
  `);
  return sqlRows<{ id: string }>(result).length > 0;
}
