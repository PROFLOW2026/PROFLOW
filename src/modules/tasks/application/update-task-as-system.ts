import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, DomainRuleError } from '@/shared/errors';
import {
  findTaskById,
  updateTaskById,
  insertTaskActivity,
} from '../data/tasks.repository';
import { isValidTransition, transitionTask } from '../domain/lifecycle';
import { buildSystemActivityActorFields } from '../domain/actor';
import type { Task, TaskStatus, TaskPriority } from '../domain/types';

export async function updateTaskAsSystem(
  context: OrgContext,
  taskId: string,
  input: {
    status?: TaskStatus;
    priority?: TaskPriority;
    bucketId?: string | null;
    dueDate?: string | null;
    title?: string;
  },
): Promise<Task> {
  const existing = await findTaskById(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');
  if (existing.isArchived) {
    throw new DomainRuleError('Cannot update an archived task', 'tasks.errors.taskIsArchived');
  }

  const patch: Parameters<typeof updateTaskById>[3] = {};
  const systemActor = buildSystemActivityActorFields();
  const events: Array<{ eventType: Parameters<typeof insertTaskActivity>[1]['eventType']; payload?: Record<string, unknown> }> = [];

  if (input.title !== undefined && input.title !== existing.title) {
    patch.title = input.title;
    events.push({ eventType: 'automation_changed', payload: { field: 'title', auto: true } });
  }

  if (input.status !== undefined && input.status !== existing.status) {
    if (!isValidTransition(existing.status, input.status)) {
      throw new DomainRuleError(
        `Invalid status transition: ${existing.status} → ${input.status}`,
        'tasks.errors.invalidTransition',
      );
    }
    const { status, completionDate } = transitionTask(existing.status, input.status);
    patch.status = status;
    if (completionDate) patch.completionDate = completionDate;
    events.push({
      eventType: input.status === 'done' ? 'completed' : 'status_changed',
      payload: { from: existing.status, to: input.status, auto: true },
    });
  }

  if (input.priority !== undefined && input.priority !== existing.priority) {
    patch.priority = input.priority;
    events.push({
      eventType: 'priority_changed',
      payload: { from: existing.priority, to: input.priority, auto: true },
    });
  }

  if (input.dueDate !== undefined && input.dueDate !== existing.dueDate) {
    patch.dueDate = input.dueDate;
    events.push({
      eventType: 'due_date_changed',
      payload: { from: existing.dueDate, to: input.dueDate, auto: true },
    });
  }

  if (input.bucketId !== undefined && input.bucketId !== existing.bucketId) {
    patch.bucketId = input.bucketId;
    events.push({
      eventType: 'bucket_changed',
      payload: { from: existing.bucketId, to: input.bucketId, auto: true },
    });
  }

  const updated = await updateTaskById(context.db, context.organizationId, taskId, patch);
  if (!updated) throw new NotFoundError('Task');

  for (const event of events) {
    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...systemActor,
      eventType: event.eventType,
      payload: event.payload ?? null,
    });
  }

  return updated;
}
