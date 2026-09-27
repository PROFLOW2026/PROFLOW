import type { OrgContext } from '@/shared/auth/context';
import type { CaptureNotificationVariant } from '@/modules/notifications/domain/copy';
import { emitNotification, listUserIdsWithPermission } from '@/modules/notifications';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord } from '../domain/types';

function captureNotificationVariant(capture: CaptureItemRecord): CaptureNotificationVariant {
  if (capture.sessionKind === 'video') return 'video';
  if (capture.detectedType === 'financial_document') return 'financial_document';
  if (capture.detectedType === 'field_media') return 'field_media';
  return 'default';
}

export async function notifyCaptureReview(
  context: OrgContext,
  capture: CaptureItemRecord,
): Promise<void> {
  const recipients = await listUserIdsWithPermission(
    context.db,
    context.organizationId,
    PERMISSIONS.DOCUMENTS_MANAGE,
  );
  if (recipients.length === 0) return;

  const captureVariant = captureNotificationVariant(capture);
  const ownerNote = capture.ownerNote?.trim() || null;

  await Promise.all(
    recipients.map((recipientUserId) =>
      emitNotification(context, {
        recipientUserId,
        type: 'capture_needs_review',
        title: 'capture_needs_review',
        body: 'capture_needs_review',
        dedupeKey: `capture_needs_review:${capture.id}`,
        deepLink: `/quick-capture/${capture.id}`,
        entityType: 'quick_capture',
        entityId: capture.id,
        metadata: {
          i18n: true,
          captureVariant,
          ownerNote,
        },
      }),
    ),
  );
}
