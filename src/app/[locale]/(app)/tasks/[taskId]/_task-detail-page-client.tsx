'use client';

import { useEffect, useState } from 'react';
import { TaskDetailSheet } from '@/modules/tasks/ui/task-detail-sheet';
import type { TaskDetail } from '@/modules/tasks/ui/_task-api-stub';
import type { TaskReminderType } from '@/modules/tasks';
import type { RecurrencePreset } from '@/modules/tasks/domain/recurrence-presets';
import type { TaskReminderToggle } from '@/modules/tasks/ui/task-reminders-section';
import type { WorkActionState } from '../../work/actions';
import {
  getTaskRecurrenceAction,
  upsertTaskRecurrenceAction,
  getTaskRemindersAction,
  upsertTaskReminderAction,
} from '../../work/actions';
import { uwmPrimaryPanelClass } from '@/shared/ui/uwm-surface-styles';

interface TaskDetailPageClientProps {
  initialTask: TaskDetail;
  onUpdate: (taskId: string, data: Record<string, unknown>) => Promise<WorkActionState>;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  today?: string;
}

const REMINDER_TYPES: TaskReminderType[] = ['on_due', 'day_before', 'custom'];

/**
 * Full-page task detail — reuses TaskDetailSheet field UI in an always-visible panel.
 */
export function TaskDetailPageClient({
  initialTask,
  onUpdate,
  getTaskDetail,
  today,
}: TaskDetailPageClientProps) {
  const [task, setTask] = useState(initialTask);
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [reminders, setReminders] = useState<TaskReminderToggle[]>([]);

  async function refreshTask(taskId: string) {
    const detail = await getTaskDetail(taskId);
    if (detail) setTask(detail);
    await loadScheduling(taskId);
  }

  async function loadScheduling(taskId: string) {
    const [recurrence, reminderRows] = await Promise.all([
      getTaskRecurrenceAction(taskId),
      getTaskRemindersAction(taskId),
    ]);
    setRecurrencePreset(recurrence.preset);
    setRecurrenceInterval(recurrence.interval);
    setReminders(
      REMINDER_TYPES.map((reminderType) => {
        const row = reminderRows.find((item) => item.reminderType === reminderType);
        return {
          reminderType,
          enabled: Boolean(row),
          remindAt: row?.remindAt
            ? new Date(row.remindAt).toISOString().slice(0, 16)
            : undefined,
        };
      }),
    );
  }

  useEffect(() => {
    void loadScheduling(initialTask.id);
  }, [initialTask.id]);

  async function handleUpdate(taskId: string, data: Record<string, unknown>) {
    const result = await onUpdate(taskId, data);
    if (result.success) {
      await refreshTask(taskId);
    }
    return result;
  }

  return (
    <div className={uwmPrimaryPanelClass}>
      <TaskDetailSheet
        task={task}
        open
        embedded
        onOpenChange={() => {}}
        onUpdate={handleUpdate}
        onRefresh={refreshTask}
        today={today}
        canPostpone
        recurrencePreset={recurrencePreset}
        recurrenceInterval={recurrenceInterval}
        onRecurrenceChange={async ({ preset, interval }) => {
          setRecurrencePreset(preset);
          setRecurrenceInterval(interval);
          await upsertTaskRecurrenceAction(task.id, { preset, interval });
          await loadScheduling(task.id);
        }}
        reminders={reminders}
        onReminderChange={async (value) => {
          setReminders((current) =>
            current.map((item) =>
              item.reminderType === value.reminderType ? value : item,
            ),
          );
          await upsertTaskReminderAction(task.id, {
            reminderType: value.reminderType,
            enabled: value.enabled,
            remindAt: value.remindAt ? new Date(value.remindAt) : undefined,
          });
        }}
      />
    </div>
  );
}
