import 'server-only';

import { getQuoteById } from '@/modules/quotes';
import { findProjectById } from '@/modules/projects';
import { insertEntityLink } from '@/modules/collaboration';
import { internalActor } from '@/shared/actor';
import { findTaskById } from '../data/tasks.repository';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { PROJECT_CAPABILITIES, assertProjectCapability } from '@/modules/project-team';

export type BusinessTaskLinkSourceType = 'quote' | 'project';

export async function linkTaskToBusinessEntity(
  context: OrgContext,
  taskId: string,
  source: { readonly entityType: BusinessTaskLinkSourceType; readonly entityId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');
  if (!task.projectId) {
    throw new ValidationError([{ path: 'taskId', message: 'Task must belong to a project' }]);
  }

  await assertProjectCapability(context, task.projectId, PROJECT_CAPABILITIES.TASKS_MANAGE);

  if (source.entityType === 'quote') {
    const quote = await getQuoteById(context, source.entityId);
    if (!quote.convertedProjectId || quote.convertedProjectId !== task.projectId) {
      throw new NotFoundError('Quote');
    }
  } else if (source.entityType === 'project') {
    const project = await findProjectById(context.db, context.organizationId, source.entityId);
    if (!project || project.id !== task.projectId) {
      throw new NotFoundError('Project');
    }
  }

  await insertEntityLink(context.db, {
    organizationId: context.organizationId,
    projectId: task.projectId,
    sourceType: source.entityType,
    sourceId: source.entityId,
    targetType: 'task',
    targetId: task.id,
    relation: 'related',
    actor: internalActor(context.userId),
  });
}
