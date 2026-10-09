import 'server-only';

import { submitApprovalRequest } from '@/modules/approvals';
import { findLatestRequestForEntityGate } from '@/modules/approvals/data/approvals.repository';
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
  return { requestId, alreadyOpen: result.kind === 'already_open' };
}

export async function assertTaskCompletionApprovalSatisfied(
  context: OrgContext,
  taskId: string,
): Promise<void> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task?.approvalRequired) return;

  const latest = await findLatestRequestForEntityGate(
    context.db,
    context.organizationId,
    'task',
    taskId,
  );
  if (latest?.status === 'approved') return;

  throw new DomainRuleError(
    'Task requires an approved submission before completion',
    'tasks.errors.approvalRequiredBeforeDone',
    { taskId, approvalStatus: latest?.status ?? null },
  );
}
