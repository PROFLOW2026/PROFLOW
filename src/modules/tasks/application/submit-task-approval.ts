import 'server-only';

import { getLatestApprovalForEntity, submitApprovalRequest } from '@/modules/approvals';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { findTaskById } from '../data/tasks.repository';

export async function submitTaskApprovalRequest(
  context: OrgContext,
  taskId: string,
): Promise<{ requestId: string | null; alreadyOpen: boolean }> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const result = await submitApprovalRequest(context, {
    entityType: 'task',
    entityId: taskId,
    requireMatchingRule: false,
  });

  if (result.kind === 'not_required') {
    return { requestId: null, alreadyOpen: false };
  }

  const requestId = result.request.id;
  const alreadyOpen = result.kind === 'already_open';

  if (result.kind === 'submitted') {
    const { notifyTaskApprovalSubmitted } = await import('./notify-task-approval');
    void notifyTaskApprovalSubmitted(context, {
      taskId,
      requestId,
      submittedByUserId: context.userId,
    }).catch(() => {
      /* notification failure must not block submit */
    });
  }

  return { requestId, alreadyOpen };
}

export async function assertTaskCompletionApprovalSatisfied(
  context: OrgContext,
  taskId: string,
): Promise<void> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task?.approvalRequired) return;

  const latest = await getLatestApprovalForEntity(context, 'task', taskId);
  if (latest?.status === 'approved') return;

  throw new DomainRuleError(
    'Task requires an approved submission before completion',
    'tasks.errors.approvalRequiredBeforeDone',
    { taskId, approvalStatus: latest?.status ?? null },
  );
}
