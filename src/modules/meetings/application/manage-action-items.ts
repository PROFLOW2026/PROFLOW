import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findMeetingActionItemById,
  findMeetingById,
  insertMeetingActionItem,
  linkTaskToActionItem,
  updateMeetingActionItemById,
} from '../data/meetings.repository';
import type {
  CreateActionItemInput,
  MeetingActionItem,
  UpdateActionItemInput,
} from '../domain/types';

export async function createMeetingActionItem(
  context: OrgContext,
  input: CreateActionItemInput,
): Promise<MeetingActionItem> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  if (!input.title?.trim()) {
    throw new ValidationError([{ path: 'title', message: 'Action item title is required' }]);
  }

  const meeting = await findMeetingById(context.db, context.organizationId, input.meetingId);
  if (!meeting) throw new NotFoundError('Meeting');

  return insertMeetingActionItem(context.db, context.organizationId, {
    ...input,
    title: input.title.trim(),
  });
}

export async function updateMeetingActionItem(
  context: OrgContext,
  actionItemId: string,
  patch: UpdateActionItemInput,
): Promise<MeetingActionItem> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const updated = await updateMeetingActionItemById(
    context.db,
    context.organizationId,
    actionItemId,
    patch,
  );

  if (!updated) throw new NotFoundError('Action item');
  return updated;
}

export async function toggleActionItemStatus(
  context: OrgContext,
  actionItemId: string,
  newStatus: 'open' | 'done' | 'cancelled',
): Promise<MeetingActionItem> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const updated = await updateMeetingActionItemById(
    context.db,
    context.organizationId,
    actionItemId,
    { status: newStatus },
  );

  if (!updated) throw new NotFoundError('Action item');
  return updated;
}

/**
 * Create a task from an action item. Calls the tasks module to create a proper
 * task record with source=meeting_action, then links it back to the action item.
 *
 * The task creation is delegated to the tasks module (Agent A) via dynamic import
 * to avoid hard circular dependencies.
 */
export async function createTaskFromActionItem(
  context: OrgContext,
  actionItemId: string,
  taskInput: {
    workspaceId: string;
    projectId?: string | null;
    title?: string;
    dueDate?: string | null;
  },
): Promise<{ actionItem: MeetingActionItem; taskId: string }> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);
  assertPermission(context, PERMISSIONS.TASKS_CREATE);

  const actionItem = await findMeetingActionItemById(
    context.db,
    context.organizationId,
    actionItemId,
  );
  if (!actionItem) throw new NotFoundError('Action item');

  if (actionItem.taskId) {
    throw new ValidationError([
      { path: 'taskId', message: 'This action item already has a linked task' },
    ]);
  }

  // Delegate task creation to the tasks module.
  // The tasks module (Agent A) owns task creation; we use a dynamic import
  // to avoid circular dependencies at module load time.
  const { createTask } = await import('@/modules/tasks/application/create-task');

  const task = await createTask(context, {
    workspaceId: taskInput.workspaceId,
    projectId: taskInput.projectId ?? null,
    title: taskInput.title ?? actionItem.title,
    dueDate: taskInput.dueDate ?? actionItem.dueDate ?? null,
    source: 'meeting_action',
  });

  const updated = await linkTaskToActionItem(
    context.db,
    context.organizationId,
    actionItemId,
    task.id,
  );

  if (!updated) throw new NotFoundError('Action item');

  return { actionItem: updated, taskId: task.id };
}
