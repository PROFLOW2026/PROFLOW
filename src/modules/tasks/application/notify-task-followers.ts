import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { emitNotification } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import { taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import {
  findEmployeeAppAccountByUserId,
  isActiveEmployeeAppAccount,
} from '@/modules/employee-app';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { listTaskFollowerUserIds } from '../data/tasks.repository';

/**
 * Emits `task_status_updated` notifications to all org-member followers of a task
 * when its status transitions. The emitter (caller) is excluded from notifications.
 *
 * Fire-and-forget: individual delivery failures are swallowed so a notification
 * failure never blocks the task update itself.
 */
export async function notifyTaskFollowersOfStatusChange(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly newStatus: string;
  },
): Promise<void> {
  const followerUserIds = await listTaskFollowerUserIds(context.db, input.taskId);
  if (followerUserIds.length === 0) return;

  const copy = notificationCopy(notificationsCopyTranslator(context.locale), 'task_status_updated', {
    reference: input.taskTitle,
    extra: input.newStatus,
  });

  await Promise.allSettled(
    followerUserIds
      .filter((userId) => userId !== context.userId)
      .map(async (recipientUserId) => {
        const account = await findEmployeeAppAccountByUserId(
          context.db,
          context.organizationId,
          recipientUserId,
        );
        const recipientIsEmployee = account != null && isActiveEmployeeAppAccount(account);

        return emitNotification(context, {
          recipientUserId,
          type: 'task_status_updated',
          title: copy.title,
          body: copy.body,
          dedupeKey: `task_follower_update:${input.taskId}:${recipientUserId}:${input.newStatus}`,
          entityType: 'task',
          entityId: input.taskId,
          deepLink: taskDeepLinkForRecipient(`/tasks/${input.taskId}`, recipientIsEmployee),
          severity: 'info',
        });
      }),
  );
}
