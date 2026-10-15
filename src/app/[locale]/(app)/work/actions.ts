'use server';

import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { mapServerActionError, ValidationError } from '@/shared/errors';
import {
  getMyWork,
  getMyWorkPage,
  listAccessibleTasks,
  listAccessibleTasksPage,
  createTask,
  updateTask,
  archiveTask,
  unarchiveTask,
  addAssignee,
  removeAssignee,
  syncTaskAssignees,
  callerHasTaskAssignGrant,
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
  reorderChecklistItem,
  addDependency,
  removeDependency,
  getTaskDetail,
  moveTaskToBucket,
  duplicateTask,
  listTaskPickerOptions,
  listTaskTemplates,
  saveTaskAsTemplate,
  createTaskFromTemplate,
  createSubtask,
  listTaskAttachments,
  getTaskDocumentPanelData,
  linkDocumentToTask,
  unlinkDocumentFromTask,
  recordTaskAttachmentAdded,
  linkProviderFileToTask,
  linkProviderFileToTaskComment,
} from '@/modules/tasks';
import type { ProviderFileLinkInput } from '@/modules/tasks/application/task-provider-file-link';
import type { ProjectCloudFileRef } from '@/modules/external-storage/client';
import {
  getTaskRecurrence,
  upsertTaskRecurrence,
} from '@/modules/tasks/application/manage-recurrence';
import {
  listRemindersForTask,
  upsertReminderForTask,
} from '@/modules/tasks/application/manage-reminders';
import type { MyWorkView } from '@/modules/tasks';
import type {
  CreateTaskInput,
  TaskListFilters,
  TaskStatus,
  TaskPriority,
  TaskDependencyType,
} from '@/modules/tasks';
import { MY_WORK_VIEW_LIMIT, TASK_LIST_MAX_LIMIT } from '@/modules/tasks/domain/list-window';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { listUnscheduledTasksPage } from '@/modules/tasks/application/list-unscheduled-tasks';
import { resolveWorkLensCalendarQuery } from '@/modules/tasks/application/work-lens-calendar-filters';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import type { TaskCardData } from '@/modules/tasks/ui/task-api';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';

// ─── Shared state type ────────────────────────────────────────────────────────

export interface WorkActionState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  readonly newTaskId?: string;
  readonly subtaskId?: string;
  readonly templateId?: string;
}

async function mapWorkActionError(error: unknown): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');
  const tTasks = await getTranslations('tasks');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { tasks: (key) => tTasks(key) },
  });
}

// ─── My Work ─────────────────────────────────────────────────────────────────

export async function getMyWorkAction(view: MyWorkView, options: { limit?: number; offset?: number } = {}) {
  return withOrgContext(async (context) => {
    return getMyWork(context, { view, ...options });
  });
}

export async function fetchMyWorkViewAction(
  view: MyWorkView,
): Promise<{ tasks: TaskCardData[]; hasMore: boolean }> {
  return withOrgContext(async (context) => {
    const page = await getMyWorkPage(context, {
      view,
      today: todayInTimeZone(context.organization.timezone),
      limit: MY_WORK_VIEW_LIMIT,
      offset: 0,
    });
    return {
      tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, page.tasks)),
      hasMore: page.hasMore,
    };
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
  try {
    await withOrgContext(async (context) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateTask(context, taskId, data as any);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function bulkUpdateTasksAction(
  taskIds: string[],
  patch: Record<string, unknown>,
): Promise<{ updated: number; failed: readonly { id: string; reason: string }[] }> {
  const { bulkUpdateTasks } = await import('@/modules/tasks/application/bulk-update-tasks');
  return withOrgContext(async (context) => {
    const result = await bulkUpdateTasks(context, taskIds, {
      status: patch.status as TaskStatus | undefined,
      priority: patch.priority as TaskPriority | undefined,
      dueDate: patch.dueDate as string | null | undefined,
      assigneeOrgMemberId: patch.assigneeOrgMemberId as string | null | undefined,
    });
    return { updated: result.updated, failed: [...result.failed] };
  });
}

export async function loadMoreAccessibleTasksAction(input: {
  offset: number;
  projectId?: string;
  boardId?: string;
  workspaceId?: string;
  listFilters?: TaskListFilters;
  limit?: number;
  excludeCancelled?: boolean;
}): Promise<{ tasks: TaskCardData[]; hasMore: boolean; nextOffset: number }> {
  return withOrgContext(async (context) => {
    const limit = input.limit ?? TASK_LIST_MAX_LIMIT;
    const page = await listAccessibleTasksPage(context, {
      limit,
      offset: input.offset,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.boardId ? { boardId: input.boardId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.listFilters ?? {}),
    });
    const visible = input.excludeCancelled
      ? page.tasks.filter((task) => task.status !== 'cancelled')
      : page.tasks;
    return {
      tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, visible)),
      hasMore: page.hasMore,
      nextOffset: input.offset + page.tasks.length,
    };
  });
}

export async function loadMoreGlobalBoardTasksAction(offset: number) {
  return loadMoreWorkLensTasksAction(offset, {}, { excludeCancelled: true });
}

export async function loadTaskGanttDependenciesAction(
  taskIds: string[],
): Promise<
  Array<{
    id: string;
    predecessorId: string;
    successorId: string;
    type: 'finish_to_start';
  }>
> {
  const { listTaskGanttDependencies } = await import(
    '@/modules/tasks/application/list-task-gantt-dependencies'
  );
  return withOrgContext(async (context) => {
    const rows = await listTaskGanttDependencies(context, taskIds);
    return rows.map((row) => ({
      id: row.id,
      predecessorId: row.predecessorId,
      successorId: row.successorId,
      type: 'finish_to_start' as const,
    }));
  });
}

export async function loadMoreWorkSurfaceTasksAction(offset: number) {
  return loadMoreWorkLensTasksAction(offset, {});
}

export async function loadMoreWorkLensTasksAction(
  offset: number,
  urlParams: Record<string, string> = {},
  options: { excludeCancelled?: boolean } = {},
): Promise<{ tasks: TaskCardData[]; hasMore: boolean; nextOffset: number }> {
  return withOrgContext(async (context) => {
    const today = todayInTimeZone(context.organization.timezone);
    let lensParams: Record<string, string> = urlParams;
    if (urlParams.month && (!urlParams.anchorFrom || !urlParams.anchorTo)) {
      const calendar = resolveWorkLensCalendarQuery(urlParams, today);
      lensParams = {
        ...urlParams,
        anchorFrom: calendar.anchorFrom,
        anchorTo: calendar.anchorTo,
      };
    }
    const page = await listAccessibleWorkLensTasksPage(context, lensParams, {
      limit: TASK_LIST_MAX_LIMIT,
      offset,
      excludeCancelled: options.excludeCancelled,
      today,
    });
    return {
      tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, page.tasks)),
      hasMore: page.hasMore,
      nextOffset: offset + page.tasks.length,
    };
  });
}

export async function loadMoreUnscheduledTasksAction(
  offset: number,
  urlParams: Record<string, string> = {},
): Promise<{ tasks: TaskCardData[]; hasMore: boolean }> {
  return withOrgContext(async (context) => {
    const page = await listUnscheduledTasksPage(context, urlParams, { offset });
    return {
      tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, page.tasks)),
      hasMore: page.hasMore,
    };
  });
}

export async function loadMoreMyWorkAction(
  view: MyWorkView,
  offset: number,
): Promise<{ tasks: TaskCardData[]; hasMore: boolean }> {
  return withOrgContext(async (context) => {
    const page = await getMyWorkPage(context, {
      view,
      today: todayInTimeZone(context.organization.timezone),
      limit: MY_WORK_VIEW_LIMIT,
      offset,
    });
    return {
      tasks: serializeTaskCardsForClient(await mapTasksToCardDataForOrg(context, page.tasks)),
      hasMore: page.hasMore,
    };
  });
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
    const approvalRequired = formData.get('approvalRequired') === 'on' || formData.get('approvalRequired') === '1';

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
        approvalRequired,
      });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

/** FAB / ?new=1 on My Work — uses first accessible workspace when none is set. */
export async function createMyWorkTaskFromFabAction(input: CreateTaskInput): Promise<void> {
  await withOrgContext(async (context) => {
    const { listWorkspaces } = await import('@/modules/workspaces');
    const workspaces = await listWorkspaces(context);
    const workspaceId = input.workspaceId || workspaces[0]?.id;
    if (!workspaceId) {
      throw new ValidationError([{ path: 'workspaceId', message: 'No workspace available' }]);
    }
    await createTask(context, {
      ...input,
      workspaceId,
      projectId: input.projectId ?? null,
      boardId: input.boardId ?? null,
      bucketId: input.bucketId ?? null,
    });
  });
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
    const approvalRequiredRaw = formData.get('approvalRequired');
    const approvalRequired =
      approvalRequiredRaw === null
        ? undefined
        : approvalRequiredRaw === 'on' || approvalRequiredRaw === '1';

    await withOrgContext(async (context) => {
      await updateTask(context, taskId, {
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate || null } : {}),
        ...(startDate !== undefined ? { startDate: startDate || null } : {}),
        ...(approvalRequired !== undefined ? { approvalRequired } : {}),
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

export async function unarchiveTaskAction(taskId: string): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await unarchiveTask(context, taskId);
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

export async function syncTaskAssigneesAction(
  taskId: string,
  input: { assigneeKeys?: string[]; assignAllProjectTeam?: boolean },
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await syncTaskAssignees(context, taskId, input);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function listProjectTaskAssigneeOptionsAction(projectId: string) {
  return withOrgContext(async (context) => {
    const { listProjectParticipantAssigneeOptions } = await import('@/modules/projects');
    if (!callerHasTaskAssignGrant(context)) return [];
    const options = await listProjectParticipantAssigneeOptions(context, projectId);
    return options.map((option) => ({
      key: option.key,
      displayName: option.displayName,
      jobTitle: option.jobTitle,
    }));
  });
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

export async function reorderChecklistItemAction(
  itemId: string,
  afterSortKey: string | null,
  beforeSortKey: string | null,
): Promise<WorkActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await reorderChecklistItem(context, itemId, afterSortKey, beforeSortKey);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function listOrgTaskLabelsAction(): Promise<
  readonly { id: string; name: string; color: string | null }[]
> {
  return withOrgContext(async (context) => {
    const { listOrgLabels } = await import('@/modules/tasks/data/tasks.repository');
    const rows = await listOrgLabels(context.db, context.organizationId, false);
    return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
  });
}

export async function listTaskAssigneeOptionsAction(taskId: string): Promise<
  readonly { key: string; displayName: string; jobTitle?: string | null }[]
> {
  return withOrgContext(async (context) => {
    if (!callerHasTaskAssignGrant(context)) return [];

    const { findTaskById } = await import('@/modules/tasks/data/tasks.repository');
    const task = await findTaskById(context.db, context.organizationId, taskId);
    if (!task) return [];

    if (task.projectId) {
      const { listProjectParticipantAssigneeOptions } = await import('@/modules/projects');
      const options = await listProjectParticipantAssigneeOptions(context, task.projectId);
      return options.map((option) => ({
        key: option.key,
        displayName: option.displayName,
        jobTitle: option.jobTitle,
      }));
    }

    if (!task.workspaceId) return [];

    const { listWorkspaceMembers } = await import('@/modules/workspaces/data/workspaces.repository');
    const { and, eq, inArray } = await import('drizzle-orm');
    const { employees, organizationMemberships, profiles } = await import('@drizzle/schema');

    const members = await listWorkspaceMembers(
      context.db,
      context.organizationId,
      task.workspaceId,
    );
    if (members.length === 0) return [];

    const employeeIds = members.map((m) => m.employeeId).filter((id): id is string => Boolean(id));
    const orgMemberIds = members
      .map((m) => m.orgMemberId)
      .filter((id): id is string => Boolean(id));

    const employeeNames = new Map<string, string>();
    if (employeeIds.length > 0) {
      const rows = await context.db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, context.organizationId),
            inArray(employees.id, employeeIds),
          ),
        );
      for (const row of rows) {
        if (row.name) employeeNames.set(row.id, row.name);
      }
    }

    const memberNames = new Map<string, string>();
    if (orgMemberIds.length > 0) {
      const rows = await context.db
        .select({
          id: organizationMemberships.id,
          displayName: profiles.displayName,
          email: profiles.email,
        })
        .from(organizationMemberships)
        .leftJoin(profiles, eq(profiles.id, organizationMemberships.userId))
        .where(
          and(
            eq(organizationMemberships.organizationId, context.organizationId),
            inArray(organizationMemberships.id, orgMemberIds),
          ),
        );
      for (const row of rows) {
        memberNames.set(row.id, row.displayName?.trim() || row.email?.trim() || row.id);
      }
    }

    const options: { key: string; displayName: string; jobTitle?: string | null }[] = [];
    for (const member of members) {
      if (member.employeeId) {
        options.push({
          key: `e:${member.employeeId}`,
          displayName: employeeNames.get(member.employeeId) ?? member.employeeId,
        });
      } else if (member.orgMemberId) {
        options.push({
          key: `m:${member.orgMemberId}`,
          displayName: memberNames.get(member.orgMemberId) ?? member.orgMemberId,
        });
      }
    }

    return options.sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export async function addDependencyAction(
  sourceTaskId: string,
  targetTaskId: string,
  dependencyType: TaskDependencyType,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await addDependency(context, sourceTaskId, targetTaskId, dependencyType);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function removeDependencyAction(
  sourceTaskId: string,
  targetTaskId: string,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await removeDependency(context, sourceTaskId, targetTaskId);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

// ─── Duplicate / Templates / Subtasks ────────────────────────────────────────

export async function duplicateTaskAction(
  taskId: string,
  options: {
    includeAssignees?: boolean;
    targetProjectId?: string | null;
    copyDates?: boolean;
  } = {},
): Promise<WorkActionState> {
  try {
    const newTask = await withOrgContext(async (context) =>
      duplicateTask(context, taskId, options),
    );
    return { success: true, newTaskId: newTask.id };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function saveTaskAsTemplateAction(taskId: string): Promise<WorkActionState> {
  try {
    const result = await withOrgContext(async (context) =>
      saveTaskAsTemplate(context, taskId),
    );
    return { success: true, templateId: result.templateId };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function createTaskFromTemplateAction(input: {
  templateId: string;
  workspaceId: string;
  projectId?: string | null;
  boardId?: string | null;
  bucketId?: string | null;
  title?: string;
}): Promise<WorkActionState> {
  try {
    const task = await withOrgContext(async (context) =>
      createTaskFromTemplate(context, input),
    );
    return { success: true, newTaskId: task.id };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function createSubtaskAction(
  parentTaskId: string,
  input: { title: string; dueDate?: string | null },
): Promise<WorkActionState> {
  try {
    const subtask = await withOrgContext(async (context) =>
      createSubtask(context, parentTaskId, input),
    );
    return { success: true, subtaskId: subtask.id };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function listTaskPickerOptionsAction(taskId: string) {
  return withOrgContext(async (context) => listTaskPickerOptions(context, taskId));
}

export async function listTaskTemplatesAction() {
  return withOrgContext(async (context) => listTaskTemplates(context));
}

// ─── Recurrence & Reminders ─────────────────────────────────────────────────

export async function getTaskRecurrenceAction(taskId: string) {
  return withOrgContext(async (context) => getTaskRecurrence(context, taskId));
}

export async function upsertTaskRecurrenceAction(
  taskId: string,
  input: Record<string, unknown>,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => upsertTaskRecurrence(context, taskId, input));
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function getTaskRemindersAction(taskId: string) {
  return withOrgContext(async (context) => listRemindersForTask(context, taskId));
}

export async function upsertTaskReminderAction(
  taskId: string,
  input: Record<string, unknown>,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => upsertReminderForTask(context, taskId, input));
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

// ─── Task Attachments ─────────────────────────────────────────────────────────

export async function listTaskAttachmentsAction(taskId: string) {
  return withOrgContext(async (context) => {
    try {
      return await listTaskAttachments(context, taskId);
    } catch {
      return [];
    }
  });
}

export async function getTaskDocumentPanelAction(taskId: string) {
  return withOrgContext(async (context) => {
    try {
      return await getTaskDocumentPanelData(context, taskId);
    } catch {
      return {
        documents: [],
        linkCandidates: [],
        canRead: false,
        canManage: false,
        storageConfigured: false,
        canClassifyCompensation: false,
        projectId: null,
        canBrowseCloudFiles: false,
      };
    }
  });
}

export async function linkTaskDocumentAction(
  taskId: string,
  input: {
    documentId: string;
    label?: string | null;
    privacyClass?: 'standard' | 'compensation' | null;
  },
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await linkDocumentToTask(context, taskId, input.documentId, {
        label: input.label,
        privacyClass: input.privacyClass,
      });
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function unlinkTaskDocumentAction(
  taskId: string,
  linkId: string,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await unlinkDocumentFromTask(context, taskId, linkId);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function recordTaskAttachmentAddedAction(
  taskId: string,
  documentId: string,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await recordTaskAttachmentAdded(context, taskId, documentId);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function linkProviderFileToTaskAction(
  taskId: string,
  input: ProjectCloudFileRef &
    Pick<ProviderFileLinkInput, 'projectId' | 'label' | 'privacyClass' | 'semanticFolderType'>,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await linkProviderFileToTask(context, taskId, input);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function linkProviderFileToTaskCommentAction(
  taskId: string,
  commentId: string,
  input: ProjectCloudFileRef &
    Pick<ProviderFileLinkInput, 'projectId' | 'semanticFolderType'>,
): Promise<WorkActionState> {
  try {
    await withOrgContext(async (context) => {
      await linkProviderFileToTaskComment(context, taskId, commentId, input);
    });
    return { success: true };
  } catch (error) {
    return mapWorkActionError(error);
  }
}

export async function searchTaskMentionCandidatesAction(taskId: string, query: string) {
  return withOrgContext(async (context) => {
    const { searchTaskMentionCandidates } = await import(
      '@/modules/tasks/application/search-task-mention-candidates'
    );
    return searchTaskMentionCandidates(context, taskId, query);
  });
}

export async function listTaskTransferTargetsAction() {
  return withOrgContext(async (context) => {
    const { listTaskTransferTargets } = await import(
      '@/modules/tasks/application/list-task-transfer-targets'
    );
    return listTaskTransferTargets(context);
  });
}

export async function moveTaskToProjectAction(
  taskId: string,
  input: {
    targetProjectId: string;
    targetBoardId?: string | null;
    targetBucketId?: string | null;
    confirmRemoveInaccessibleAssignees?: boolean;
  },
): Promise<WorkActionState & { taskId?: string }> {
  try {
    const task = await withOrgContext(async (context) => {
      const { moveTaskToProject } = await import(
        '@/modules/tasks/application/move-task-to-project'
      );
      return moveTaskToProject(context, taskId, input);
    });
    return { success: true, taskId: task.id };
  } catch (error) {
    return mapWorkActionError(error);
  }
}
