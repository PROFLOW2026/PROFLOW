import 'server-only';

import { and, eq } from 'drizzle-orm';
import { employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { emitNotification } from '@/modules/notifications';
import { taskPostponedByEmployeeNotificationCopy } from '@/modules/notifications/domain/copy';
import { taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import {
  findEmployeeAppAccountByUserId,
  isActiveEmployeeAppAccount,
} from '@/modules/employee-app';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { listEffectiveProjectParticipants } from '@/modules/projects/application/project-participants';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import type { PostponementOption } from '../domain/postpone-task-due-date';

function formatNotificationDate(locale: string, isoDate: string | null): string {
  if (!isoDate) return '—';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** Org owner and project managers only — not followers, assignees, or creator by default. */
export async function resolveTaskPostponementManagerRecipientUserIds(
  context: OrgContext,
  input: {
    readonly projectId: string | null;
  },
): Promise<string[]> {
  const userIds = new Set<string>();

  const owner = await findActiveOrgOwnerUserId(context.db, context.organizationId);
  if (owner?.userId) userIds.add(owner.userId);

  if (input.projectId) {
    const participants = await listEffectiveProjectParticipants(
      context.db,
      context.organizationId,
      input.projectId,
      context.organization.timezone,
    );
    for (const participant of participants) {
      if (participant.isProjectManager && participant.userId) {
        userIds.add(participant.userId);
      }
    }
  }

  return [...userIds];
}

/**
 * Informational notification to org owner and project managers when a task is
 * postponed. Read/open clears unread state; no approval.
 */
export async function notifyTaskPostponedByEmployee(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly projectId: string | null;
    readonly employeeId: string;
    readonly employeeName: string;
    readonly previousDueDate: string | null;
    readonly newDueDate: string;
    readonly postponementOption: PostponementOption;
    readonly reason?: string | null;
    readonly activityId: string;
  },
): Promise<void> {
  const recipientUserIds = await resolveTaskPostponementManagerRecipientUserIds(context, {
    projectId: input.projectId,
  });
  if (recipientUserIds.length === 0) return;

  await Promise.allSettled(
    recipientUserIds
      .filter((userId) => userId !== context.userId)
      .map(async (recipientUserId) => {
        const t = notificationsCopyTranslator(context.locale);
        const copy = taskPostponedByEmployeeNotificationCopy(t, {
          employeeName: input.employeeName,
          taskTitle: input.taskTitle,
          fromDate: formatNotificationDate(context.locale, input.previousDueDate),
          toDate: formatNotificationDate(context.locale, input.newDueDate),
          reason: input.reason,
        });

        const account = await findEmployeeAppAccountByUserId(
          context.db,
          context.organizationId,
          recipientUserId,
        );
        const recipientIsEmployee = account != null && isActiveEmployeeAppAccount(account);

        return emitNotification(context, {
          recipientUserId,
          type: 'task_postponed_by_employee',
          title: copy.title,
          body: copy.body,
          dedupeKey: `task_postponed:${input.activityId}:${recipientUserId}`,
          entityType: 'task',
          entityId: input.taskId,
          deepLink: taskDeepLinkForRecipient(`/tasks/${input.taskId}`, recipientIsEmployee),
          severity: 'info',
        });
      }),
  );
}

export async function loadEmployeeDisplayName(
  context: OrgContext,
  employeeId: string,
): Promise<string> {
  const [row] = await context.db
    .select({ name: employees.name })
    .from(employees)
    .where(
      and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId)),
    );
  return row?.name?.trim() || '—';
}
