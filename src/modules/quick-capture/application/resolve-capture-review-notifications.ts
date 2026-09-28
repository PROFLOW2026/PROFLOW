import type { OrgContext } from '@/shared/auth/context';
import { resolveNotificationsRpc } from '@/modules/notifications/data/notifications.repository';

/**
 * Resolves all open `capture_needs_review` notifications for a capture row.
 * Call only after the capture has successfully reached a terminal status.
 */
export async function resolveCaptureReviewNotifications(
  context: OrgContext,
  captureId: string,
): Promise<number> {
  return resolveNotificationsRpc(
    context.db,
    context.organizationId,
    'capture_needs_review',
    captureId,
  );
}
