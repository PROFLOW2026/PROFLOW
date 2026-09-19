import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  findLabelById,
  insertLabelAssignment,
  deleteLabelAssignment,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';

export async function addLabelToTask(
  context: OrgContext,
  taskId: string,
  labelId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const [task, label] = await Promise.all([
    findTaskById(context.db, context.organizationId, taskId),
    findLabelById(context.db, context.organizationId, labelId),
  ]);

  if (!task) throw new NotFoundError('Task');
  if (!label) throw new NotFoundError('Label');

  await insertLabelAssignment(context.db, {
    taskId,
    labelId,
    organizationId: context.organizationId,
  });

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'label_added',
    payload: { labelId, labelName: label.name },
  });
}

export async function removeLabelFromTask(
  context: OrgContext,
  taskId: string,
  labelId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  await deleteLabelAssignment(context.db, taskId, labelId);
}
