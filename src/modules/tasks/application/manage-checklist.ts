import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  insertChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  listChecklistItems,
  insertTaskActivity,
} from '../data/tasks.repository';
import { generateSortKey, insertBetween, appendAfter } from '../domain/lexorank';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import type { TaskChecklistItem } from '../domain/types';

export async function addChecklistItem(
  context: OrgContext,
  taskId: string,
  input: {
    title: string;
    dueDate?: string | null;
    assigneeOrgMemberId?: string | null;
    assigneeEmployeeId?: string | null;
  },
): Promise<TaskChecklistItem> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const title = input.title?.trim();
  if (!title) {
    throw new ValidationError([{ path: 'title', message: 'Checklist item title is required' }]);
  }

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  // Determine sort key: append after last item
  const existing = await listChecklistItems(context.db, taskId);
  const lastKey = existing[existing.length - 1]?.sortKey;
  const sortKey = lastKey ? appendAfter(lastKey) : generateSortKey();

  return insertChecklistItem(context.db, {
    taskId,
    organizationId: context.organizationId,
    title,
    sortKey,
    dueDate: input.dueDate ?? null,
    assigneeOrgMemberId: input.assigneeOrgMemberId ?? null,
    assigneeEmployeeId: input.assigneeEmployeeId ?? null,
  });
}

export async function toggleChecklistItem(
  context: OrgContext,
  checklistItemId: string,
  isDone: boolean,
): Promise<TaskChecklistItem> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const updated = await updateChecklistItem(context.db, checklistItemId, context.organizationId, {
    isDone,
  });
  if (!updated) throw new NotFoundError('ChecklistItem');

  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId: updated.taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'checklist_completed',
    payload: { itemId: checklistItemId, isDone },
  });

  return updated;
}

export async function reorderChecklistItem(
  context: OrgContext,
  checklistItemId: string,
  afterSortKey: string | null,
  beforeSortKey: string | null,
): Promise<TaskChecklistItem> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  let sortKey: string;
  if (afterSortKey && beforeSortKey) {
    sortKey = insertBetween(afterSortKey, beforeSortKey);
  } else if (afterSortKey) {
    sortKey = appendAfter(afterSortKey);
  } else {
    sortKey = generateSortKey();
  }

  const updated = await updateChecklistItem(context.db, checklistItemId, context.organizationId, {
    sortKey,
  });
  if (!updated) throw new NotFoundError('ChecklistItem');
  return updated;
}

export async function removeChecklistItem(
  context: OrgContext,
  checklistItemId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  await deleteChecklistItem(context.db, checklistItemId, context.organizationId);
}
