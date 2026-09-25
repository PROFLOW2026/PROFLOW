import 'server-only';

import { and, eq, inArray, lte, notInArray } from 'drizzle-orm';
import { taskReminders, tasks } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import {
  buildEmployeeTaskAttentionItems,
  type EmployeeTaskAttentionInput,
  type EmployeeTaskAttentionItem,
} from '../domain/employee-task-attention';

export async function listDueReminderTaskIds(
  context: OrgContext,
  taskIds: readonly string[],
  now = new Date(),
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();

  const rows = await context.db
    .select({ taskId: taskReminders.taskId })
    .from(taskReminders)
    .innerJoin(tasks, eq(taskReminders.taskId, tasks.id))
    .where(
      and(
        eq(taskReminders.organizationId, context.organizationId),
        inArray(taskReminders.taskId, [...taskIds]),
        lte(taskReminders.remindAt, now),
        eq(tasks.organizationId, context.organizationId),
        notInArray(tasks.status, ['done', 'cancelled']),
      ),
    );

  return new Set(rows.map((row) => row.taskId));
}

export async function loadEmployeeTaskAttention(
  context: OrgContext,
  tasksInScope: readonly EmployeeTaskAttentionInput[],
  today: string,
): Promise<EmployeeTaskAttentionItem[]> {
  const reminderTaskIds = await listDueReminderTaskIds(
    context,
    tasksInScope.map((task) => task.id),
  );
  return buildEmployeeTaskAttentionItems({
    tasks: tasksInScope,
    reminderTaskIds,
    today,
  });
}
