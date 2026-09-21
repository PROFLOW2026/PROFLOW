import type { OrgContext } from '@/shared/auth/context';
import { findTaskById, insertTaskActivity } from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';

export async function recordTaskApprovalActivity(
  context: OrgContext,
  taskId: string,
  payload: { decision: 'approved' | 'rejected'; requestId: string },
): Promise<void> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) return;

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'approval_result',
    payload,
  });
}
