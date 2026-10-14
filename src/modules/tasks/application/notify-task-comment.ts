import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';
import { taskAssignees, organizationMemberships, employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { emitNotification } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import {
  findEmployeeAppAccountByUserId,
  isActiveEmployeeAppAccount,
} from '@/modules/employee-app';
import { taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { listTaskFollowerUserIds } from '../data/tasks.repository';

async function resolveTaskAssigneeUserIds(
  context: OrgContext,
  taskId: string,
): Promise<string[]> {
  const memberRows = await context.db
    .select({ userId: organizationMemberships.userId })
    .from(taskAssignees)
    .innerJoin(
      organizationMemberships,
      and(
        eq(taskAssignees.orgMemberId, organizationMemberships.id),
        eq(organizationMemberships.organizationId, context.organizationId),
      ),
    )
    .where(
      and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.organizationId, context.organizationId),
        isNotNull(taskAssignees.orgMemberId),
      ),
    );

  const employeeRows = await context.db
    .select({ userId: employees.userId })
    .from(taskAssignees)
    .innerJoin(
      employees,
      and(
        eq(taskAssignees.employeeId, employees.id),
        eq(employees.organizationId, context.organizationId),
      ),
    )
    .where(
      and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.organizationId, context.organizationId),
        isNotNull(taskAssignees.employeeId),
      ),
    );

  const userIds = new Set<string>();
  for (const row of memberRows) {
    if (row.userId) userIds.add(row.userId);
  }
  for (const row of employeeRows) {
    if (row.userId) userIds.add(row.userId);
  }
  return [...userIds];
}

async function emitTaskCommentNotification(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly commentId: string;
    readonly recipientUserId: string;
    readonly type: 'task_comment_mention' | 'task_comment_added';
  },
): Promise<void> {
  if (input.recipientUserId === context.userId) return;

  const t = notificationsCopyTranslator(context.locale);
  const copy = notificationCopy(t, input.type, {
    reference: input.taskTitle,
  });

  const account = await findEmployeeAppAccountByUserId(
    context.db,
    context.organizationId,
    input.recipientUserId,
  );
  const recipientIsEmployee = account != null && isActiveEmployeeAppAccount(account);

  await emitNotification(context, {
    recipientUserId: input.recipientUserId,
    type: input.type,
    title: copy.title,
    body: copy.body,
    dedupeKey: `${input.type}:${input.commentId}:${input.recipientUserId}`,
    entityType: 'task',
    entityId: input.taskId,
    deepLink: taskDeepLinkForRecipient(`/tasks/${input.taskId}`, recipientIsEmployee),
    severity: 'info',
  });
}

/**
 * Notifies mentioned users and task assignees/followers when a comment is created.
 */
export async function notifyTaskCommentAdded(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly commentId: string;
    readonly mentionedUserIds?: readonly string[];
  },
): Promise<void> {
  const mentioned = new Set(input.mentionedUserIds ?? []);

  for (const recipientUserId of mentioned) {
    await emitTaskCommentNotification(context, {
      ...input,
      recipientUserId,
      type: 'task_comment_mention',
    });
  }

  const assigneeUserIds = await resolveTaskAssigneeUserIds(context, input.taskId);
  const followerUserIds = await listTaskFollowerUserIds(context.db, input.taskId);
  const audience = new Set([...assigneeUserIds, ...followerUserIds]);

  for (const recipientUserId of audience) {
    if (mentioned.has(recipientUserId)) continue;
    await emitTaskCommentNotification(context, {
      ...input,
      recipientUserId,
      type: 'task_comment_added',
    });
  }
}
