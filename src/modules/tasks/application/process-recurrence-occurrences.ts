import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import {
  findRecurrenceRuleById,
  listPendingOccurrencesDue,
  getTaskDetail,
  insertTaskAssignee,
  insertChecklistItem,
  insertLabelAssignment,
  listTaskReminders,
  upsertTaskReminder,
} from '../data/tasks.repository';
import { generateOccurrences, createGeneratedTask } from './schedule-recurrence';
import { generateSortKey, appendAfter } from '../domain/lexorank';
import { resolveReminderAt } from './manage-reminders';
import type { TaskReminderType } from '../domain/types';

/**
 * Copies reminder types onto a generated occurrence and recomputes remindAt
 * from the new due date. Custom reminders are omitted because resolveReminderAt
 * cannot derive them from a due date (copying the template instant would be stale).
 * Do NOT copy attachments. Do NOT copy dependencies.
 */
export function buildOccurrenceReminderCopies(
  reminders: readonly { reminderType: TaskReminderType }[],
  dueDate: string,
  timezone: string,
): Array<{ reminderType: TaskReminderType; remindAt: Date }> {
  const copies: Array<{ reminderType: TaskReminderType; remindAt: Date }> = [];
  for (const reminder of reminders) {
    if (reminder.reminderType === 'custom') continue;
    const remindAt = resolveReminderAt(reminder.reminderType, dueDate, timezone);
    if (!remindAt) continue;
    copies.push({ reminderType: reminder.reminderType, remindAt });
  }
  return copies;
}

const MATERIALIZE_CAP = 50;
const GENERATION_HORIZON_DAYS = 14;

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatDueDate(occurrenceAt: Date): string {
  return occurrenceAt.toISOString().slice(0, 10);
}

/**
 * Ensures occurrences exist in the horizon, then materializes pending ones into tasks.
 * Idempotent via UNIQUE(rule_id, occurrence_at) and occurrence status guards.
 */
export async function processTaskRecurrenceForOrg(
  context: OrgContext,
  now: Date = new Date(),
): Promise<{ generated: number; skipped: number; materialized: number }> {
  const horizon = addDays(now, GENERATION_HORIZON_DAYS);
  const occurrenceResult = await generateOccurrences(context, now, horizon);

  const pending = await listPendingOccurrencesDue(
    context.db,
    context.organizationId,
    now,
    MATERIALIZE_CAP,
  );

  let materialized = 0;

  for (const occurrence of pending) {
    const rule = await findRecurrenceRuleById(
      context.db,
      context.organizationId,
      occurrence.ruleId,
    );
    if (!rule?.isActive || !rule.templateTaskId) continue;

    const template = await getTaskDetail(
      context.db,
      context.organizationId,
      rule.templateTaskId,
    );
    if (!template) continue;

    const templateReminders = await listTaskReminders(
      context.db,
      context.organizationId,
      template.id,
    );
    const dueDate = formatDueDate(occurrence.occurrenceAt);
    const reminderCopies = buildOccurrenceReminderCopies(
      templateReminders,
      dueDate,
      context.organization.timezone,
    );

    const task = await createGeneratedTask(context, occurrence.id, rule, {
      workspaceId: template.workspaceId,
      title: template.title,
      description: template.description,
      projectId: template.projectId,
      boardId: template.boardId,
      bucketId: template.bucketId,
      dueDate,
    });

    await withTransaction(context.db, async (tx) => {
      for (const assignee of template.assignees) {
        await insertTaskAssignee(tx, {
          taskId: task.id,
          organizationId: context.organizationId,
          orgMemberId: assignee.orgMemberId,
          employeeId: assignee.employeeId,
          assignedByOrgMemberId: null,
        });
      }

      let sortKey = generateSortKey();
      for (const item of template.checklistItems) {
        await insertChecklistItem(tx, {
          taskId: task.id,
          organizationId: context.organizationId,
          title: item.title,
          sortKey,
          dueDate: item.dueDate,
          assigneeOrgMemberId: item.assigneeOrgMemberId,
          assigneeEmployeeId: item.assigneeEmployeeId,
        });
        sortKey = appendAfter(sortKey);
      }

      for (const label of template.labels) {
        await insertLabelAssignment(tx, {
          taskId: task.id,
          labelId: label.id,
          organizationId: context.organizationId,
        });
      }

      // Reminder types only. Do NOT copy attachments. Do NOT copy dependencies.
      for (const reminder of reminderCopies) {
        await upsertTaskReminder(tx, {
          organizationId: context.organizationId,
          taskId: task.id,
          reminderType: reminder.reminderType,
          remindAt: reminder.remindAt,
        });
      }
    });

    materialized += 1;
  }

  return {
    generated: occurrenceResult.generated,
    skipped: occurrenceResult.skipped,
    materialized,
  };
}
