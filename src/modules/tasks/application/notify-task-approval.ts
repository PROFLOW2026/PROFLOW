import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { emitNotification, listUserIdsWithPermission } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import { taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import {
  findEmployeeAppAccountByUserId,
  isActiveEmployeeAppAccount,
} from '@/modules/employee-app';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findTaskById } from '../data/tasks.repository';

async function recipientUsesEmployeeTaskLinks(
  context: OrgContext,
  recipientUserId: string,
): Promise<boolean> {
  const account = await findEmployeeAppAccountByUserId(
    context.db,
    context.organizationId,
    recipientUserId,
  );
  return account != null && isActiveEmployeeAppAccount(account);
}

function taskApprovalDeepLink(
  taskId: string,
  recipientIsEmployee: boolean,
  tab?: 'approvals',
): string {
  const base = taskDeepLinkForRecipient(`/tasks/${taskId}`, recipientIsEmployee);
  return tab === 'approvals' ? `${base}?tab=approvals` : base;
}

export async function notifyTaskApprovalSubmitted(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly requestId: string;
    readonly submittedByUserId: string;
  },
): Promise<void> {
  const task = await findTaskById(context.db, context.organizationId, input.taskId);
  if (!task) return;

  const approverUserIds = await listUserIdsWithPermission(
    context.db,
    context.organizationId,
    PERMISSIONS.TASKS_APPROVE,
    50,
  );

  const copy = notificationCopy(notificationsCopyTranslator(context.locale), 'task_approval_requested', {
    reference: task.title,
  });

  await Promise.all(
    approverUserIds
      .filter((userId) => userId && userId !== input.submittedByUserId)
      .map(async (recipientUserId) => {
        const recipientIsEmployee = await recipientUsesEmployeeTaskLinks(context, recipientUserId);
        await emitNotification(context, {
          recipientUserId,
          type: 'task_approval_requested',
          title: copy.title,
          body: copy.body,
          dedupeKey: `task_approval_requested:${input.requestId}:${recipientUserId}`,
          entityType: 'task',
          entityId: input.taskId,
          deepLink: taskApprovalDeepLink(input.taskId, recipientIsEmployee, 'approvals'),
          severity: 'warning',
        });
      }),
  );
}

export async function notifyTaskApprovalDecided(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly requestId: string;
    readonly decision: 'approved' | 'rejected';
    readonly submittedByUserId: string | null;
  },
): Promise<void> {
  if (!input.submittedByUserId || input.submittedByUserId === context.userId) return;

  const task = await findTaskById(context.db, context.organizationId, input.taskId);
  if (!task) return;

  const recipientIsEmployee = await recipientUsesEmployeeTaskLinks(
    context,
    input.submittedByUserId,
  );
  const copy = notificationCopy(notificationsCopyTranslator(context.locale), 'task_approval_decided', {
    reference: task.title,
    extra: input.decision,
  });

  await emitNotification(context, {
    recipientUserId: input.submittedByUserId,
    type: 'task_approval_decided',
    title: copy.title,
    body: copy.body,
    dedupeKey: `task_approval_decided:${input.requestId}:${input.decision}:${input.submittedByUserId}`,
    entityType: 'task',
    entityId: input.taskId,
    deepLink: taskApprovalDeepLink(input.taskId, recipientIsEmployee),
    severity: input.decision === 'approved' ? 'info' : 'warning',
  });
}
