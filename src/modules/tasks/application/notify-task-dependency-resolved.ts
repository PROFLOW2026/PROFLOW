import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';
import { employees, organizationMemberships, taskAssignees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { emitNotification } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import {
  findEmployeeAppAccountByUserId,
  isActiveEmployeeAppAccount,
} from '@/modules/employee-app';
import { taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { runAutomationEventMatches } from '@/modules/automations/application/run-rules';
import {
  areAllPredecessorsComplete,
  findTaskById,
  listSuccessorTaskIds,
} from '../data/tasks.repository';

async function resolvePrimaryAssigneeUserId(
  context: OrgContext,
  taskId: string,
): Promise<string | null> {
  const [memberRow] = await context.db
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
    )
    .limit(1);

  if (memberRow?.userId) return memberRow.userId;

  const [employeeRow] = await context.db
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
    )
    .limit(1);

  return employeeRow?.userId ?? null;
}

/**
 * When a predecessor completes, notifies assignees of successors whose dependencies
 * are fully satisfied and runs `task_dependency_resolved` automation rules.
 */
export async function notifySuccessorsWhenDependenciesResolved(
  context: OrgContext,
  completedTaskId: string,
): Promise<void> {
  const completed = await findTaskById(context.db, context.organizationId, completedTaskId);
  if (!completed || completed.status !== 'done') return;

  const successorIds = await listSuccessorTaskIds(
    context.db,
    context.organizationId,
    completedTaskId,
  );
  if (successorIds.length === 0) return;

  for (const successorId of successorIds) {
    const ready = await areAllPredecessorsComplete(
      context.db,
      context.organizationId,
      successorId,
    );
    if (!ready) continue;

    const successor = await findTaskById(context.db, context.organizationId, successorId);
    if (!successor || successor.isArchived) continue;

    const recipientUserId = await resolvePrimaryAssigneeUserId(context, successorId);
    if (!recipientUserId) continue;

    const copy = notificationCopy(
      notificationsCopyTranslator(context.locale),
      'task_dependency_resolved',
      { reference: successor.title, extra: completed.title },
    );

    const account = await findEmployeeAppAccountByUserId(
      context.db,
      context.organizationId,
      recipientUserId,
    );
    const recipientIsEmployee = account != null && isActiveEmployeeAppAccount(account);

    await emitNotification(context, {
      recipientUserId,
      type: 'task_dependency_resolved',
      title: copy.title,
      body: copy.body,
      dedupeKey: `task_dependency_resolved:${successorId}:${completedTaskId}:${recipientUserId}`,
      entityType: 'task',
      entityId: successorId,
      deepLink: taskDeepLinkForRecipient(`/tasks/${successorId}`, recipientIsEmployee),
      severity: 'info',
      metadata: { completedPredecessorId: completedTaskId },
    });

    await runAutomationEventMatches(context, 'task_dependency_resolved', [
      {
        entityType: 'task',
        entityId: successorId,
        taskId: successorId,
        workspaceId: successor.workspaceId,
        title: successor.title,
        body: successor.title,
        href: `/tasks/${successorId}`,
        projectId: successor.projectId,
      },
    ]).catch(() => undefined);
  }
}
