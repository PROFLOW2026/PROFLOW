import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { NotificationInbox } from '../domain/types';
import { listNotificationsSchema, type ListNotificationsInput } from '../validation/schemas';
import {
  countUnreadForRecipient,
  listNotificationsForRecipient,
  NOTIFICATION_LIST_CAP,
} from '../data/notifications.repository';

export async function listNotifications(
  context: OrgContext,
  raw: ListNotificationsInput = {},
): Promise<NotificationInbox> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);

  const parsed = listNotificationsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const limit = parsed.data.limit ?? NOTIFICATION_LIST_CAP;
  const recipientUserId = context.userId;

  const [items, unreadCount] = await Promise.all([
    listNotificationsForRecipient(context.db, context.organizationId, recipientUserId, { limit }),
    countUnreadForRecipient(context.db, context.organizationId, recipientUserId),
  ]);

  return { items, unreadCount };
}
