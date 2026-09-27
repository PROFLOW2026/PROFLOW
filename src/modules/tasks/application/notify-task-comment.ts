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

/**
 * Resolves the user IDs of all members assigned to a task.
 * Returns an empty array if no assignees are found.
 */
async function resolveTaskAssigneeUserIds(
  context: OrgContext,
  taskId: string,
): Promise<string[]> {
  // Fetch assignees whose slot is an org member
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

  // Fetch assignees whose slot is an employee
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

/**
 * Emits a `task_comment_mention` notification to all task assignees
 * (excluding the commenter) when a comment is created on a task.
 *
 * Uses a per-comment dedupe key so each comment produces exactly one
 * notification per recipient (re-emitting the same comment is idempotent).
 */
export async function notifyTaskCommentAdded(
  context: OrgContext,
  input: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly commentId: string;
  },
): Promise<void> {
  const assigneeUserIds = await resolveTaskAssigneeUserIds(context, input.taskId);
  if (assigneeUserIds.length === 0) return;

  const t = notificationsCopyTranslator(context.locale);

  for (const recipientUserId of assigneeUserIds) {
    // Do not notify the commenter themselves
    if (recipientUserId === context.userId) continue;

    const copy = notificationCopy(t, 'task_comment_mention', {
      reference: input.taskTitle,
    });

    const account = await findEmployeeAppAccountByUserId(
      context.db,
      context.organizationId,
      recipientUserId,
    );
    const recipientIsEmployee = account != null && isActiveEmployeeAppAccount(account);

    await emitNotification(context, {
      recipientUserId,
      type: 'task_comment_mention',
      title: copy.title,
      body: copy.body,
      // Per-comment dedupe key: each comment produces one notification per recipient.
      dedupeKey: `task_comment:${input.commentId}:${recipientUserId}`,
      entityType: 'task',
      entityId: input.taskId,
      deepLink: taskDeepLinkForRecipient(`/tasks/${input.taskId}`, recipientIsEmployee),
      severity: 'info',
    });
  }
}
