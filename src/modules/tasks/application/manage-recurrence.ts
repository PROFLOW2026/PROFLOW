import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  findRecurrenceRuleByTemplateTaskId,
  upsertRecurrenceRule,
  deactivateRecurrenceRule,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { buildRruleFromPreset, detectPresetFromRrule } from '../domain/recurrence-presets';
import type { RecurrencePreset } from '../domain/recurrence-presets';
import { upsertTaskRecurrenceSchema } from '../validation/recurrence-schema';
import type { TaskRecurrenceRule } from '../domain/types';

export interface TaskRecurrenceView {
  readonly rule: TaskRecurrenceRule | null;
  readonly preset: RecurrencePreset;
  readonly interval: number;
  readonly weekday: string | null;
}

export async function getTaskRecurrence(
  context: OrgContext,
  taskId: string,
): Promise<TaskRecurrenceView> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  const rule = await findRecurrenceRuleByTemplateTaskId(
    context.db,
    context.organizationId,
    taskId,
  );
  if (!rule || !rule.isActive) {
    return { rule: null, preset: 'none', interval: 1, weekday: null };
  }
  const detected = detectPresetFromRrule(rule.rrule);
  return {
    rule,
    preset: detected.preset,
    interval: detected.interval,
    weekday: detected.weekday,
  };
}

export async function upsertTaskRecurrence(
  context: OrgContext,
  taskId: string,
  rawInput: unknown,
): Promise<TaskRecurrenceRule | null> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const parsed = upsertTaskRecurrenceSchema.safeParse(rawInput);
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
  if (input.preset === 'none') {
    const existing = await findRecurrenceRuleByTemplateTaskId(
      context.db,
      context.organizationId,
      taskId,
    );
    if (existing) {
      await deactivateRecurrenceRule(context.db, context.organizationId, existing.id);
      await recordRecurrenceActivity(context, taskId, {
        action: 'disabled',
        preset: 'none',
      });
    }
    return null;
  }

  const startsAt = input.startsAt ?? new Date();
  const rrule = buildRruleFromPreset(input.preset, {
    interval: input.interval,
    weekday: input.weekday,
    startsAt,
  });

  const previous = await findRecurrenceRuleByTemplateTaskId(
    context.db,
    context.organizationId,
    taskId,
  );

  const rule = await upsertRecurrenceRule(context.db, {
    organizationId: context.organizationId,
    templateTaskId: taskId,
    rrule,
    timezone: context.organization.timezone,
    startsAt,
    endsAt: input.endsAt ?? null,
    maxOccurrences: input.maxOccurrences ?? null,
    isActive: true,
    createdByOrgMemberId: context.membershipId,
  });

  await recordRecurrenceActivity(context, taskId, {
    action: previous ? 'updated' : 'enabled',
    preset: input.preset,
    rrule,
  });

  return rule;
}

async function recordRecurrenceActivity(
  context: OrgContext,
  taskId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const actorFields = buildActivityActorFieldsFromContext(context);
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...actorFields,
    eventType: 'automation_changed',
    payload: { field: 'recurrence', ...payload },
  });
}
