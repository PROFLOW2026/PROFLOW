'use server';

import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import {
  getMyWork,
  listAccessibleTasks,
  createTask,
  updateTask,
  archiveTask,
  addAssignee,
  removeAssignee,
  followTask,
  unfollowTask,
  addLabelToTask,
  removeLabelFromTask,
  createComment,
  listComments,
  listActivity,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
  addDependency,
  removeDependency,
  getTaskDetail,
  moveTaskToBucket,
} from '@/modules/tasks';
import type { MyWorkView } from '@/modules/tasks';
import type { TaskListFilters, TaskStatus, TaskPriority, TaskDependencyType } from '@/modules/tasks';

// ─── Shared state type ────────────────────────────────────────────────────────

export interface WorkActionState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
}

// ─── My Work ─────────────────────────────────────────────────────────────────

export async function getMyWorkAction(view: MyWorkView, options: { limit?: number; offset?: number } = {}) {
  return withOrgContext(async (context) => {
    return getMyWork(context, { view, ...options });
  });
}

// ─── Task List ────────────────────────────────────────────────────────────────

export async function listTasksAction(filters: TaskListFilters & { workspaceId?: string } = {}) {
  return withOrgContext(async (context) => {
    return listAccessibleTasks(context, filters);
  });
}

// ─── Task Detail ──────────────────────────────────────────────────────────────

export async function getTaskDetailAction(taskId: string) {
  return withOrgContext(async (context) => {
    try {
      const detail = await getTaskDetail(context, taskId);
      if (!detail) return null;
      const { mapTaskDetailToUiForOrg } = await import('@/modules/tasks/application/map-tasks-for-ui');
      return mapTaskDetailToUiForOrg(context, detail);
    } catch {
      return null;
    }
  });
}

export async function updateTaskFieldsAction(
  taskId: string,
  data: Record<string, unknown>,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateTask(context, taskId, data as any);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Create Task ─────────────────────────────────────────────────────────────

export async function createTaskAction(
  _prev: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const workspaceId = String(formData.get('workspaceId') ?? '');
    const title = String(formData.get('title') ?? '');
    const description = formData.get('description') as string | null;
    const projectId = formData.get('projectId') as string | null;
    const boardId = formData.get('boardId') as string | null;
    const bucketId = formData.get('bucketId') as string | null;
    const priority = (formData.get('priority') as TaskPriority | null) ?? undefined;
    const startDate = formData.get('startDate') as string | null;
    const dueDate = formData.get('dueDate') as string | null;

    await withOrgContext(async (context) => {
      await createTask(context, {
        workspaceId,
        title,
        description: description || null,
        projectId: projectId || null,
        boardId: boardId || null,
        bucketId: bucketId || null,
        priority,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Update Task ──────────────────────────────────────────────────────────────

export async function updateTaskAction(
  taskId: string,
  _prev: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const title = formData.get('title') as string | undefined;
    const description = formData.get('description') as string | null | undefined;
    const status = formData.get('status') as TaskStatus | null;
    const priority = formData.get('priority') as TaskPriority | null;
    const dueDate = formData.get('dueDate') as string | null | undefined;
    const startDate = formData.get('startDate') as string | null | undefined;

    await withOrgContext(async (context) => {
      await updateTask(context, taskId, {
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate || null } : {}),
        ...(startDate !== undefined ? { startDate: startDate || null } : {}),
      });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Archive Task ─────────────────────────────────────────────────────────────

export async function archiveTaskAction(taskId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await archiveTask(context, taskId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Move Task to Bucket ──────────────────────────────────────────────────────

export async function moveTaskToBucketAction(
  taskId: string,
  bucketId: string,
  sortKey?: string,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await moveTaskToBucket(context, taskId, bucketId, { sortKey });
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Assignees ────────────────────────────────────────────────────────────────

export async function addAssigneeAction(
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await addAssignee(context, taskId, actor);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeAssigneeAction(
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeAssignee(context, taskId, actor);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

export async function followTaskAction(taskId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await followTask(context, taskId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function unfollowTaskAction(taskId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await unfollowTask(context, taskId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export async function addLabelAction(taskId: string, labelId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await addLabelToTask(context, taskId, labelId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeLabelAction(taskId: string, labelId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeLabelFromTask(context, taskId, labelId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function createCommentAction(
  taskId: string,
  _prev: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const body = String(formData.get('body') ?? '');

    await withOrgContext(async (context) => {
      await createComment(context, taskId, { body });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function listCommentsAction(taskId: string, options: { limit?: number; offset?: number } = {}) {
  return withOrgContext(async (context) => {
    return listComments(context, taskId, options);
  });
}

export async function listActivityAction(taskId: string, options: { limit?: number; offset?: number } = {}) {
  return withOrgContext(async (context) => {
    return listActivity(context, taskId, options);
  });
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function addChecklistItemAction(
  taskId: string,
  _prev: WorkActionState,
  formData: FormData,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const title = String(formData.get('title') ?? '');

    await withOrgContext(async (context) => {
      await addChecklistItem(context, taskId, { title });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function toggleChecklistItemAction(
  itemId: string,
  isDone: boolean,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await toggleChecklistItem(context, itemId, isDone);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeChecklistItemAction(itemId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeChecklistItem(context, itemId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export async function addDependencyAction(
  sourceTaskId: string,
  targetTaskId: string,
  dependencyType: TaskDependencyType,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await addDependency(context, sourceTaskId, targetTaskId, dependencyType);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeDependencyAction(
  sourceTaskId: string,
  targetTaskId: string,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeDependency(context, sourceTaskId, targetTaskId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}
