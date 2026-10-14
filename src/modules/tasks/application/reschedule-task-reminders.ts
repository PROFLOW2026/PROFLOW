import type { OrgContext } from '@/shared/auth/context';
import { listTaskReminders, upsertTaskReminder } from '../data/tasks.repository';
import { resolveReminderAt } from './manage-reminders';
import type { TaskReminderType } from '../domain/types';

const RESCHEDULABLE: ReadonlySet<TaskReminderType> = new Set(['on_due', 'day_before']);

export interface RescheduleTaskRemindersDeps {
  readonly listTaskReminders: typeof listTaskReminders;
  readonly upsertTaskReminder: typeof upsertTaskReminder;
}

/**
 * Recomputes remind_at for due-relative reminders after a due date change.
 */
export async function rescheduleTaskReminders(
  context: OrgContext,
  taskId: string,
  dueDate: string | null,
  deps: RescheduleTaskRemindersDeps = {
    listTaskReminders,
    upsertTaskReminder,
  },
): Promise<void> {
  if (!dueDate) return;

  const reminders = await deps.listTaskReminders(context.db, context.organizationId, taskId);
  const timezone = context.organization.timezone;

  for (const reminder of reminders) {
    if (!RESCHEDULABLE.has(reminder.reminderType)) continue;
    const remindAt = resolveReminderAt(reminder.reminderType, dueDate, timezone);
    if (!remindAt) continue;
    await deps.upsertTaskReminder(context.db, {
      organizationId: context.organizationId,
      taskId,
      reminderType: reminder.reminderType,
      remindAt,
    });
  }
}
