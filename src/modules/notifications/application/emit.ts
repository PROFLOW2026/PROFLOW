import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { EVENT_DOMAIN, type EmitNotificationInput } from '../domain/types';
import { emitNotificationSchema } from '../validation/schemas';
import { emitNotificationRpc } from '../data/notifications.repository';

/**
 * Inserts/upserts via SQL `app.emit_notification` only.
 * Never INSERT into public.notifications as another user from application code.
 */
export async function emitNotification(
  context: OrgContext,
  raw: EmitNotificationInput,
): Promise<string> {
  const parsed = emitNotificationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  return emitNotificationRpc(context.db, {
    organizationId: context.organizationId,
    recipientUserId: input.recipientUserId,
    type: input.type,
    domain: EVENT_DOMAIN[input.type],
    title: input.title,
    body: input.body,
    dedupeKey: input.dedupeKey,
    severity: input.severity ?? 'info',
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    deepLink: input.deepLink ?? null,
    metadata: input.metadata ?? null,
    expiresAt: input.expiresAt ?? null,
  });
}
