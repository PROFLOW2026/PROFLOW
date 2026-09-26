import type { OrgContext } from '@/shared/auth/context';
import { emitNotification, listUserIdsWithPermission } from '@/modules/notifications';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureItemRecord } from '../domain/types';

function notificationCopy(capture: CaptureItemRecord): { title: string; body: string } {
  if (capture.sessionKind === 'video' || capture.detectedType === 'field_media') {
    return {
      title: 'Field capture ready for review',
      body: capture.ownerNote?.trim() || 'A field capture session is ready for review.',
    };
  }
  if (capture.detectedType === 'financial_document') {
    return {
      title: 'Financial capture ready for review',
      body: capture.ownerNote?.trim() || 'A captured document may be financial — review required.',
    };
  }
  return {
    title: 'Quick capture ready for review',
    body: capture.ownerNote?.trim() || 'A new capture is ready for review.',
  };
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

  const copy = notificationCopy(capture);
  await Promise.all(
    recipients.map((recipientUserId) =>
      emitNotification(context, {
        recipientUserId,
        type: 'capture_needs_review',
        title: copy.title,
        body: copy.body,
        dedupeKey: `capture_needs_review:${capture.id}`,
        deepLink: `/quick-capture/${capture.id}`,
        entityType: 'quick_capture',
        entityId: capture.id,
      }),
    ),
  );
}
