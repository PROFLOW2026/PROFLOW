import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import {
  findActiveRecurrenceRules,
  listExistingOccurrences,
  insertOccurrence,
  updateOccurrenceStatus,
  insertTask,
  insertTaskActivity,
  countNonCancelledOccurrencesForRule,
  insertTaskAssignee,
  insertChecklistItem,
  insertLabelAssignment,
  upsertTaskReminder,
} from '../data/tasks.repository';
import { expandOccurrences } from '../domain/recurrence';
import { isIdempotentOccurrence } from '../domain/recurrence';
import { buildSystemCreatorFields, buildSystemActivityActorFields } from '../domain/actor';
import { generateSortKey, appendAfter } from '../domain/lexorank';
import type { TaskRecurrenceRule, TaskReminderType } from '../domain/types';

/**
 * Generates recurrence occurrences for all active rules in the window [from, to].
 *
 * Idempotent: uses UNIQUE(rule_id, occurrence_at) + on-conflict-do-nothing.
 * Must be called by a background job or cron — never a user request.
 */
export async function generateOccurrences(
  context: OrgContext,
  from: Date,
  to: Date,
): Promise<{ generated: number; skipped: number }> {
  const rules = await findActiveRecurrenceRules(context.db, context.organizationId);

  let generated = 0;
  let skipped = 0;

  for (const rule of rules) {
    const existingCount = await countNonCancelledOccurrencesForRule(context.db, rule.id);
    const remaining =
      rule.maxOccurrences != null ? Math.max(0, rule.maxOccurrences - existingCount) : null;
    if (remaining === 0) continue;

    const slots = await expandOccurrences(rule, from, to, { remainingOccurrences: remaining });
    const existing = await listExistingOccurrences(context.db, rule.id, from, to);

    for (const slot of slots) {
      if (isIdempotentOccurrence(existing, rule.id, slot.occurrenceAt)) {
        skipped++;
        continue;
      }

      const occurrence = await insertOccurrence(context.db, {
        ruleId: rule.id,
        organizationId: context.organizationId,
        occurrenceAt: slot.occurrenceAt,
        status: 'pending',
      });

      if (occurrence) generated++;
    }
  }

  return { generated, skipped };
}

export interface GeneratedTaskTemplateCopy {
  readonly assignees: ReadonlyArray<{
    orgMemberId: string | null;
    employeeId: string | null;
  }>;
  readonly checklistItems: ReadonlyArray<{
    title: string;
    dueDate: string | null;
    assigneeOrgMemberId: string | null;
    assigneeEmployeeId: string | null;
  }>;
  readonly labels: ReadonlyArray<{ id: string }>;
  readonly reminderCopies: ReadonlyArray<{ reminderType: TaskReminderType; remindAt: Date }>;
}

/**
 * Creates a task from a recurrence occurrence.
 *
 * created_by_system = true, source = 'recurrence'.
 * Links back to the occurrence via generatedFromOccurrenceId.
 */
export async function createGeneratedTask(
  context: OrgContext,
  occurrenceId: string,
  rule: TaskRecurrenceRule,
  input: {
    workspaceId: string;
    title: string;
    description?: string | null;
    projectId?: string | null;
    boardId?: string | null;
    bucketId?: string | null;
    dueDate?: string | null;
  },
  templateCopy?: GeneratedTaskTemplateCopy,
) {
  return withTransaction(context.db, async (tx) => {
    const systemCreatorFields = buildSystemCreatorFields();
    const sortKey = generateSortKey();

    const task = await insertTask(tx, {
      organizationId: context.organizationId,
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      boardId: input.boardId ?? null,
      bucketId: input.bucketId ?? null,
      source: 'recurrence',
      sortKey,
      recurrenceRuleId: rule.id,
      generatedFromOccurrenceId: occurrenceId,
      ...systemCreatorFields,
      dueDate: input.dueDate ?? null,
    });

    if (templateCopy) {
      for (const assignee of templateCopy.assignees) {
        await insertTaskAssignee(tx, {
          taskId: task.id,
          organizationId: context.organizationId,
          orgMemberId: assignee.orgMemberId,
          employeeId: assignee.employeeId,
          assignedByOrgMemberId: null,
        });
      }

      let checklistSortKey = sortKey;
      for (const item of templateCopy.checklistItems) {
        await insertChecklistItem(tx, {
          taskId: task.id,
          organizationId: context.organizationId,
          title: item.title,
          sortKey: checklistSortKey,
          dueDate: item.dueDate,
          assigneeOrgMemberId: item.assigneeOrgMemberId,
          assigneeEmployeeId: item.assigneeEmployeeId,
        });
        checklistSortKey = appendAfter(checklistSortKey);
      }

      for (const label of templateCopy.labels) {
        await insertLabelAssignment(tx, {
          taskId: task.id,
          labelId: label.id,
          organizationId: context.organizationId,
        });
      }

      for (const reminder of templateCopy.reminderCopies) {
        await upsertTaskReminder(tx, {
          organizationId: context.organizationId,
          taskId: task.id,
          reminderType: reminder.reminderType,
          remindAt: reminder.remindAt,
        });
      }
    }

    await updateOccurrenceStatus(tx, occurrenceId, 'generated', task.id);

    const systemActorFields = buildSystemActivityActorFields();
    await insertTaskActivity(tx, {
      taskId: task.id,
      organizationId: context.organizationId,
      ...systemActorFields,
      eventType: 'recurrence_generated',
      payload: { ruleId: rule.id, occurrenceId },
    });

    return task;
  });
}
