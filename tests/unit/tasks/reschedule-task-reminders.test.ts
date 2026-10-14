import { describe, expect, it, vi } from 'vitest';
import {
  rescheduleTaskReminders,
  type RescheduleTaskRemindersDeps,
} from '@/modules/tasks/application/reschedule-task-reminders';
import type { OrgContext } from '@/shared/auth/context';

describe('rescheduleTaskReminders', () => {
  it('moves day_before remind_at when due date shifts', async () => {
    const upsertTaskReminder = vi.fn<RescheduleTaskRemindersDeps['upsertTaskReminder']>(
      async (_db, input) => ({
        id: 'r1',
        organizationId: input.organizationId,
        taskId: input.taskId,
        reminderType: input.reminderType,
        remindAt: input.remindAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const listTaskReminders = vi.fn<RescheduleTaskRemindersDeps['listTaskReminders']>(async () => [
      {
        id: 'r1',
        organizationId: 'org',
        taskId: 'task-1',
        reminderType: 'day_before' as const,
        remindAt: new Date('2026-10-09T06:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await rescheduleTaskReminders(
      {
        db: {} as never,
        organizationId: 'org',
        organization: { timezone: 'Asia/Jerusalem' },
      } as unknown as OrgContext,
      'task-1',
      '2026-10-15',
      { listTaskReminders, upsertTaskReminder },
    );

    expect(upsertTaskReminder).toHaveBeenCalledOnce();
    const call = upsertTaskReminder.mock.calls[0]?.[1];
    expect(call?.reminderType).toBe('day_before');
    expect(call?.remindAt).toBeDefined();
    const localDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(call!.remindAt);
    expect(localDay).toBe('2026-10-14');
  });
});
