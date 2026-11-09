import 'server-only';

import { eq } from 'drizzle-orm';
import { profiles } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db/client';
import { serverEnv } from '@/shared/env/server';
import { logger, redactEmail } from '@/shared/observability';
import {
  insertNotificationEmailLog,
  notificationEmailLogExists,
} from '@/modules/notifications';
import { getEmailPort } from '@/shared/ports/email';
import { resolveTaskDeliveryChannelStatus } from '../domain/task-delivery-channels';

/**
 * Outbound email for an existing in-app task notification. Never throws.
 * Requires `TASK_EMAIL_DELIVERY_ENABLED=true` and `EMAIL_DRIVER=resend`. Dedupe via notification_email_log.
 */
export async function trySendTaskNotificationEmail(
  context: OrgContext,
  input: {
    readonly dedupeKey: string;
    readonly recipientUserId: string;
    readonly subject: string;
    readonly body: string;
    readonly deepLink: string;
  },
): Promise<void> {
  const channels = resolveTaskDeliveryChannelStatus({
    taskEmailDeliveryEnabled: serverEnv().TASK_EMAIL_DELIVERY_ENABLED === 'true',
  });
  if (channels.email !== 'connected') return;

  const port = getEmailPort();
  if (!port.configured) return;

  const [profile] = await context.db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, input.recipientUserId))
    .limit(1);

  const recipientEmail = profile?.email?.trim();
  if (!recipientEmail) return;

  const adminDb = getAdminDb();
  const logKey = {
    organizationId: context.organizationId,
    dedupeKey: input.dedupeKey,
    recipientEmail,
  };

  try {
    if (await notificationEmailLogExists(adminDb, logKey)) return;
  } catch (error) {
    logger.warn('task_comment_mention_email.dedupe_check_failed', { error });
    return;
  }

  const appUrl = serverEnv().APP_URL.replace(/\/$/, '');
  const link = input.deepLink.startsWith('http') ? input.deepLink : `${appUrl}${input.deepLink}`;
  const text = `${input.body}\n\n${link}`;

  const result = await port.send({
    to: recipientEmail,
    subject: input.subject,
    text,
  });

  const status = result.delivered ? 'sent' : 'failed';
  try {
    await insertNotificationEmailLog(adminDb, { ...logKey, status });
  } catch (error) {
    logger.warn('task_notification_email.log_write_failed', {
      to: redactEmail(recipientEmail),
      error,
    });
  }
}

/** @deprecated Use trySendTaskNotificationEmail */
export const trySendTaskCommentMentionEmail = trySendTaskNotificationEmail;
