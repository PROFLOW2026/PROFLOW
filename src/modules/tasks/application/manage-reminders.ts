import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  listTaskReminders,
  upsertTaskReminder,
  deleteTaskReminder,
} from '../data/tasks.repository';
import { upsertTaskReminderSchema } from '../validation/reminder-schema';
import type { TaskReminder, TaskReminderType } from '../domain/types';

function startOfDayInTimezone(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day, 8, 0, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = Number.parseInt(formatter.format(utc), 10);
    utc.setUTCHours(8 - (Number.isNaN(hour) ? 0 : hour) + 9);
  } catch {
    // fallback UTC morning
  }
  return utc;
}

function subtractDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function resolveReminderAt(
  reminderType: TaskReminderType,
  taskDueDate: string | null,
  timezone: string,
  customAt?: Date,
): Date | null {
  if (reminderType === 'custom') {
    return customAt ?? null;
  }
  if (!taskDueDate) return null;
  if (reminderType === 'on_due') {
    return startOfDayInTimezone(taskDueDate, timezone);
  }
  if (reminderType === 'day_before') {
    return startOfDayInTimezone(subtractDays(taskDueDate, 1), timezone);
  }
  return null;
}

export async function listRemindersForTask(
  context: OrgContext,
  taskId: string,
): Promise<TaskReminder[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  return listTaskReminders(context.db, context.organizationId, taskId);
}

export async function upsertReminderForTask(
  context: OrgContext,
  taskId: string,
  rawInput: unknown,
): Promise<TaskReminder | null> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const parsed = upsertTaskReminderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const input = parsed.data;
  if (!input.enabled) {
    await deleteTaskReminder(
      context.db,
      context.organizationId,
      taskId,
      input.reminderType,
    );
    return null;
  }

  const remindAt = resolveReminderAt(
    input.reminderType,
    task.dueDate,
    context.organization.timezone,
    input.remindAt,
  );
  if (!remindAt) {
    throw new ValidationError([
      {
        path: 'remindAt',
        message: 'Task due date is required for this reminder type',
      },
    ]);
  }

  return upsertTaskReminder(context.db, {
    organizationId: context.organizationId,
    taskId,
    reminderType: input.reminderType,
    remindAt,
  });
}
