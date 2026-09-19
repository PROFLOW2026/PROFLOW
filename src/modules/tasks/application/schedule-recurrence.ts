import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import {
  findActiveRecurrenceRules,
  listExistingOccurrences,
  insertOccurrence,
  updateOccurrenceStatus,
  insertTask,
  insertTaskActivity,
} from '../data/tasks.repository';
import { expandOccurrences } from '../domain/recurrence';
import { isIdempotentOccurrence } from '../domain/recurrence';
import { buildSystemCreatorFields, buildSystemActivityActorFields } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { TaskRecurrenceRule } from '../domain/types';

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
    const slots = await expandOccurrences(rule, from, to);
    const existing = await listExistingOccurrences(context.db, rule.id, from, to);

    for (const slot of slots) {
      if (isIdempotentOccurrence(existing, rule.id, slot.occurrenceAt)) {
        skipped++;
        continue;
      }

      // Insert occurrence (UNIQUE constraint prevents duplicates)
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

    // Update occurrence to 'generated' and link task
    await updateOccurrenceStatus(tx, occurrenceId, 'generated', task.id);

    // Record system activity
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
