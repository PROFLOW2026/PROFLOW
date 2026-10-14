import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import {
  findRecurrenceRuleById,
  listPendingOccurrencesDue,
  getTaskDetail,
  listTaskReminders,
  updateOccurrenceStatus,
} from '../data/tasks.repository';
import { generateOccurrences, createGeneratedTask } from './schedule-recurrence';
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

/** Local calendar due date for a recurrence occurrence instant. */
export function buildOccurrenceDueDate(occurrenceAt: Date, timezone: string): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(occurrenceAt);
  return businessDate(local);
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
    if (!rule?.isActive || !rule.templateTaskId) {
      await updateOccurrenceStatus(context.db, occurrence.id, 'cancelled');
      continue;
    }

    const template = await getTaskDetail(
      context.db,
      context.organizationId,
      rule.templateTaskId,
    );
    if (!template) {
      await updateOccurrenceStatus(context.db, occurrence.id, 'cancelled');
      continue;
    }

    const templateReminders = await listTaskReminders(
      context.db,
      context.organizationId,
      template.id,
    );
    const dueDate = buildOccurrenceDueDate(occurrence.occurrenceAt, rule.timezone);
    const reminderCopies = buildOccurrenceReminderCopies(
      templateReminders,
      dueDate,
      context.organization.timezone,
    );

    await createGeneratedTask(context, occurrence.id, rule, {
      workspaceId: template.workspaceId,
      title: template.title,
      description: template.description,
      projectId: template.projectId,
      boardId: template.boardId,
      bucketId: template.bucketId,
      dueDate,
    }, {
      assignees: template.assignees.map((assignee) => ({
        orgMemberId: assignee.orgMemberId,
        employeeId: assignee.employeeId,
      })),
      checklistItems: template.checklistItems.map((item) => ({
        title: item.title,
        dueDate: item.dueDate,
        assigneeOrgMemberId: item.assigneeOrgMemberId,
        assigneeEmployeeId: item.assigneeEmployeeId,
      })),
      labels: template.labels.map((label) => ({ id: label.id })),
      reminderCopies,
    });

    materialized += 1;
  }

  return {
    generated: occurrenceResult.generated,
    skipped: occurrenceResult.skipped,
    materialized,
  };
}
