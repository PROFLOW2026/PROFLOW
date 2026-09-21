import 'server-only';

import { and, eq } from 'drizzle-orm';
import { employees, organizationMemberships } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { emitNotification } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import type { TaskAssigneeActor } from '@/modules/projects/application/project-participants';

async function resolveRecipientUserId(
  context: OrgContext,
  actor: TaskAssigneeActor,
): Promise<string | null> {
  if (actor.employeeId) {
    const [row] = await context.db
      .select({ userId: employees.userId })
      .from(employees)
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, context.organizationId),
        ),
      );
    return row?.userId ?? null;
  }
  if (actor.orgMemberId) {
    const [row] = await context.db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, actor.orgMemberId),
          eq(organizationMemberships.organizationId, context.organizationId),
        ),
      );
    return row?.userId ?? null;
  }
  return null;
}

export async function notifyTaskAssigned(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly assignee: TaskAssigneeActor;
  },
): Promise<void> {
  const recipientUserId = await resolveRecipientUserId(context, input.assignee);
  if (!recipientUserId || recipientUserId === context.userId) return;

  const copy = notificationCopy(notificationsCopyTranslator(context.locale), 'task_assigned_to_you', {
    reference: input.taskTitle,
  });

  await emitNotification(context, {
    recipientUserId,
    type: 'task_assigned_to_you',
    title: copy.title,
    body: copy.body,
    dedupeKey: `task_assigned:${input.taskId}:${recipientUserId}`,
    entityType: 'task',
    entityId: input.taskId,
    deepLink: `/tasks/${input.taskId}`,
    severity: 'info',
  });
}
