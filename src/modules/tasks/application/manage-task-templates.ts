import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  getTaskDetail,
  insertTaskTemplate,
  insertTaskTemplateItems,
  findTaskTemplateById,
  listTaskTemplateItems,
  listActiveTaskTemplates,
  insertTask,
  insertChecklistItem,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext, buildCreatorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { CreateTaskInput, Task, TaskTemplateSummary } from '../domain/types';

export async function listTaskTemplates(context: OrgContext): Promise<TaskTemplateSummary[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  return listActiveTaskTemplates(context.db, context.organizationId);
}

/**
 * Saves an existing task as an org task template (checklist → template items).
 */
export async function saveTaskAsTemplate(
  context: OrgContext,
  taskId: string,
  input?: { title?: string },
): Promise<{ templateId: string; title: string }> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const task = await getTaskDetail(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const title = input?.title?.trim() || task.title;
  if (!title) {
    throw new ValidationError([{ path: 'title', message: 'Template title is required' }]);
  }

  const template = await insertTaskTemplate(context.db, {
    organizationId: context.organizationId,
    title,
    description: task.description,
    priority: task.priority,
  });

  if (task.checklistItems.length > 0) {
    await insertTaskTemplateItems(
      context.db,
      task.checklistItems.map((item, index) => ({
        templateId: template.id,
        organizationId: context.organizationId,
        title: item.title,
        sortKey: item.sortKey || String(index).padStart(8, '0'),
      })),
    );
  } else if (task.description?.trim()) {
    await insertTaskTemplateItems(context.db, [
      {
        templateId: template.id,
        organizationId: context.organizationId,
        title: task.description.trim().slice(0, 500),
        sortKey: '00000000',
      },
    ]);
  }

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'template_saved',
    payload: { templateId: template.id, templateTitle: template.title },
  });

  return { templateId: template.id, title: template.title };
}

export interface CreateTaskFromTemplateInput {
  readonly templateId: string;
  readonly workspaceId: string;
  readonly projectId?: string | null;
  readonly boardId?: string | null;
  readonly bucketId?: string | null;
  readonly title?: string;
}

/**
 * Creates a new task from a saved task template.
 */
export async function createTaskFromTemplate(
  context: OrgContext,
  input: CreateTaskFromTemplateInput,
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_CREATE);

  const template = await findTaskTemplateById(
    context.db,
    context.organizationId,
    input.templateId,
  );
  if (!template) throw new NotFoundError('Task template');

  const items = await listTaskTemplateItems(context.db, template.id);
  const creatorFields = buildCreatorFieldsFromContext(context);
  const sortKey = generateSortKey();

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId: input.workspaceId,
    title: input.title?.trim() || template.title,
    description: template.description,
    projectId: input.projectId ?? null,
    boardId: input.boardId ?? null,
    bucketId: input.bucketId ?? null,
    priority: template.priority,
    source: 'template',
    sortKey,
    ...creatorFields,
  });

  for (const item of items) {
    await insertChecklistItem(context.db, {
      taskId: task.id,
      organizationId: context.organizationId,
      title: item.title,
      sortKey: item.sortKey,
    });
  }

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'task_from_template',
    payload: { templateId: template.id, templateTitle: template.title },
  });

  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'created',
    payload: { title: task.title, templateId: template.id },
  });

  return task;
}

/**
 * Creates a subtask under a parent task (max one nesting level).
 */
export async function createSubtask(
  context: OrgContext,
  parentTaskId: string,
  input: Pick<CreateTaskInput, 'title' | 'dueDate' | 'priority'> & { status?: Task['status'] },
): Promise<Task> {
  const { createTask } = await import('./create-task');

  const parent = await findTaskById(context.db, context.organizationId, parentTaskId);
  if (!parent) throw new NotFoundError('Task');

  const subtask = await createTask(context, {
    workspaceId: parent.workspaceId,
    projectId: parent.projectId,
    boardId: parent.boardId,
    bucketId: parent.bucketId,
    parentTaskId: parent.id,
    title: input.title,
    dueDate: input.dueDate ?? null,
    priority: input.priority,
  });

  if (input.status && input.status !== 'todo') {
    const { updateTask } = await import('./update-task');
    await updateTask(context, subtask.id, { status: input.status });
  }

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: parentTaskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'subtask_added',
    payload: { subtaskId: subtask.id, subtaskTitle: subtask.title },
  });

  return subtask;
}
