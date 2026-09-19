import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  insertTaskDependency,
  deleteTaskDependency,
  listTaskDependencies,
  insertTaskActivity,
} from '../data/tasks.repository';
import { detectCycle } from '../domain/dependencies';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { TaskDependency, TaskDependencyType } from '../domain/types';

/**
 * Adds a dependency edge with DFS cycle detection.
 *
 * sourceTaskId depends on targetTaskId
 * (i.e., sourceTask must wait for targetTask to complete).
 */
export async function addDependency(
  context: OrgContext,
  sourceTaskId: string,
  targetTaskId: string,
  dependencyType: TaskDependencyType,
): Promise<TaskDependency> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  if (sourceTaskId === targetTaskId) {
    throw new ValidationError([
      { path: 'targetTaskId', message: 'A task cannot depend on itself' },
    ]);
  }

  const [sourceTask, targetTask] = await Promise.all([
    findTaskById(context.db, context.organizationId, sourceTaskId),
    findTaskById(context.db, context.organizationId, targetTaskId),
  ]);

  if (!sourceTask) throw new NotFoundError('Source task');
  if (!targetTask) throw new NotFoundError('Target task');

  // Load all deps for cycle check
  const allDeps = await listTaskDependencies(
    context.db,
    context.organizationId,
    [sourceTaskId, targetTaskId],
  );

  // Check for existing edge
  const alreadyExists = allDeps.some(
    (d) => d.sourceTaskId === sourceTaskId && d.targetTaskId === targetTaskId,
  );
  if (alreadyExists) throw new ConflictError('Dependency already exists');

  // DFS cycle detection
  if (detectCycle(sourceTaskId, targetTaskId, allDeps)) {
    throw new DomainRuleError(
      `Adding this dependency would create a cycle between tasks`,
      'tasks.errors.dependencyCycle',
      { sourceTaskId, targetTaskId },
    );
  }

  const dep = await insertTaskDependency(context.db, {
    organizationId: context.organizationId,
    sourceTaskId,
    targetTaskId,
    dependencyType,
  });

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: sourceTaskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'dependency_added',
    payload: { targetTaskId, dependencyType },
  });

  return dep;
}

/**
 * Removes a dependency edge.
 */
export async function removeDependency(
  context: OrgContext,
  sourceTaskId: string,
  targetTaskId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  await deleteTaskDependency(
    context.db,
    sourceTaskId,
    targetTaskId,
    context.organizationId,
  );

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: sourceTaskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'dependency_removed',
    payload: { targetTaskId },
  });
}
