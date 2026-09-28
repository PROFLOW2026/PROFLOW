import type { OrgContext } from '@/shared/auth/context';
import { resolveNotificationsAsSystem } from '@/modules/notifications';

/**
 * Resolves all open `capture_needs_review` notifications for a capture row.
 * Call only after the capture has successfully reached a terminal status.
 */
export async function resolveCaptureReviewNotifications(
  context: OrgContext,
  captureId: string,
): Promise<number> {
  return resolveNotificationsAsSystem(
    context.organizationId,
    'capture_needs_review',
    captureId,
  );
}
