import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError, NotFoundError, DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  updateTaskById,
  insertTaskActivity,
} from '../data/tasks.repository';
import { isValidTransition, transitionTask } from '../domain/lifecycle';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { updateTaskSchema } from '../validation/task-schema';
import type { Task, UpdateTaskInput } from '../domain/types';

/**
 * Updates a task.
 *
 * Rules enforced:
 * - Caller must have TASKS_UPDATE (or TASKS_MANAGE_ALL for any task)
 * - Status transitions validated by lifecycle rules
 * - If projectId changed, context validated against project_workspace_links
 * - Records activity events for changed fields
 */
export async function updateTask(
  context: OrgContext,
  taskId: string,
  rawInput: UpdateTaskInput,
): Promise<Task> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const parsed = updateTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;

  const existing = await findTaskById(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');

  if (existing.isArchived) {
    throw new DomainRuleError(
      'Cannot update an archived task',
      'tasks.errors.taskIsArchived',
    );
  }

  const patch: Parameters<typeof updateTaskById>[3] = {};
  const actorFields = buildActivityActorFieldsFromContext(context);
  const activityEvents: Array<{
    eventType: Parameters<typeof insertTaskActivity>[1]['eventType'];
    payload?: Record<string, unknown>;
  }> = [];

  if (input.title !== undefined && input.title !== existing.title) {
    patch.title = input.title;
    activityEvents.push({
      eventType: 'automation_changed',
      payload: { field: 'title', from: existing.title, to: input.title },
    });
  }

  if (input.description !== undefined && input.description !== existing.description) {
    patch.description = input.description;
    activityEvents.push({
      eventType: 'automation_changed',
      payload: { field: 'description', from: existing.description, to: input.description },
    });
  }

  if (input.estimatedEffortMinutes !== undefined) patch.estimatedEffortMinutes = input.estimatedEffortMinutes;
  if (input.milestoneId !== undefined) patch.milestoneId = input.milestoneId;
  if (input.approvalRequired !== undefined) patch.approvalRequired = input.approvalRequired;
  if (input.ownerOrgMemberId !== undefined) patch.ownerOrgMemberId = input.ownerOrgMemberId;
  if (input.ownerEmployeeId !== undefined) patch.ownerEmployeeId = input.ownerEmployeeId;

  // Status transition
  if (input.status !== undefined && input.status !== existing.status) {
    if (!isValidTransition(existing.status, input.status)) {
      throw new DomainRuleError(
        `Invalid status transition: ${existing.status} → ${input.status}`,
        'tasks.errors.invalidTransition',
        { from: existing.status, to: input.status },
      );
    }
    const { status, completionDate } = transitionTask(existing.status, input.status);
    patch.status = status;
    if (completionDate) {
      patch.completionDate = completionDate;
      patch.completedByOrgMemberId = context.membershipId;
    }
    if (input.status === 'done') {
      activityEvents.push({ eventType: 'completed', payload: { from: existing.status } });
    } else if (existing.status === 'done' || existing.status === 'cancelled') {
      activityEvents.push({ eventType: 'reopened', payload: { from: existing.status, to: input.status } });
    } else {
      activityEvents.push({ eventType: 'status_changed', payload: { from: existing.status, to: input.status } });
    }
  }

  // Priority change
  if (input.priority !== undefined && input.priority !== existing.priority) {
    patch.priority = input.priority;
    activityEvents.push({
      eventType: 'priority_changed',
      payload: { from: existing.priority, to: input.priority },
    });
  }

  // Due date change
  if (input.dueDate !== undefined && input.dueDate !== existing.dueDate) {
    patch.dueDate = input.dueDate;
    activityEvents.push({
      eventType: 'due_date_changed',
      payload: { from: existing.dueDate, to: input.dueDate },
    });
  }

  if (input.startDate !== undefined) patch.startDate = input.startDate;

  // Bucket change
  if (input.bucketId !== undefined && input.bucketId !== existing.bucketId) {
    patch.bucketId = input.bucketId;
    activityEvents.push({
      eventType: 'bucket_changed',
      payload: { from: existing.bucketId, to: input.bucketId },
    });
  }

  if (input.boardId !== undefined) patch.boardId = input.boardId;

  const updated = await updateTaskById(context.db, context.organizationId, taskId, patch);
  if (!updated) throw new NotFoundError('Task');

  // Record all activity events
  for (const event of activityEvents) {
    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: event.eventType,
      payload: event.payload ?? null,
    });
  }

  return updated;
}
