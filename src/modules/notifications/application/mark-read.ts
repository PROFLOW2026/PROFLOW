import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { notificationIdSchema, type MarkNotificationReadInput } from '../validation/schemas';
import { markNotificationReadForRecipient } from '../data/notifications.repository';

export async function markNotificationRead(
  context: OrgContext,
  raw: MarkNotificationReadInput,
): Promise<void> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);

  const parsed = notificationIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const row = await markNotificationReadForRecipient(
    context.db,
    context.organizationId,
    context.userId,
    parsed.data.notificationId,
  );
  if (!row) throw new NotFoundError('Notification');
}
